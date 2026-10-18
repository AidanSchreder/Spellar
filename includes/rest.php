<?php
/**
 * REST routes, namespace spellar/v1. Both are public and set no cookies.
 *
 * GET /puzzle?date=YYYY-MM-DD   the player's local date; accepted within one day of the server's UTC
 *                               date, so every time zone works but the future schedule stays hidden.
 * POST /event                   anonymous counters (see includes/stats.php), at most 20 a day from
 *                               one address, counted in a transient keyed on a salted hash of it.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SPELLAR_EVENT_LIMIT = 20;

add_action(
	'rest_api_init',
	function () {
		register_rest_route(
			'spellar/v1',
			'/puzzle',
			array(
				'methods'             => 'GET',
				'callback'            => 'spellar_rest_puzzle',
				'permission_callback' => '__return_true',
				// "date" is checked in the callback, so every refusal carries the same no-store header.
			)
		);
		register_rest_route(
			'spellar/v1',
			'/event',
			array(
				'methods'             => 'POST',
				'callback'            => 'spellar_rest_event',
				'permission_callback' => '__return_true',
			)
		);
	}
);

function spellar_rest_error( $status, $code, $message ) {
	$response = new WP_REST_Response(
		array(
			'code'    => $code,
			'message' => $message,
			'data'    => array( 'status' => $status ),
		),
		$status
	);
	$response->header( 'Cache-Control', 'no-store' );
	return $response;
}

/** Seconds until the date ends in UTC+14, the first time zone to leave it. */
function spellar_max_age( $date, $now ) {
	return max( 0, spellar_date_ts( $date ) + 10 * HOUR_IN_SECONDS - $now ); // (date + 1) 00:00 at UTC+14 = date 10:00 UTC
}

function spellar_rest_puzzle( WP_REST_Request $request ) {
	$date = $request->get_param( 'date' );
	if ( ! spellar_is_date( $date ) ) {
		return spellar_rest_error( 400, 'spellar_bad_date', 'date must be YYYY-MM-DD.' );
	}
	if ( abs( spellar_days_between( spellar_utc_today(), $date ) ) > 1 ) {
		return spellar_rest_error( 400, 'spellar_date_out_of_range', 'date must be within one day of today.' );
	}
	$schedule = spellar_schedule();
	if ( $schedule && spellar_days_between( $schedule['launch'], $date ) < 0 ) {
		// A player still on the day before launch (far-west time zones on launch day).
		return spellar_rest_error( 404, 'spellar_not_started', 'Spellar starts on ' . $schedule['launch'] . '.' );
	}
	$word = spellar_word_for( $date );
	if ( ! $schedule || ! $word ) {
		return spellar_rest_error( 503, 'spellar_no_puzzle', 'No puzzle is available.' );
	}

	$length   = strlen( $word['word'] );
	$response = new WP_REST_Response(
		array(
			'number'     => spellar_puzzle_number( $date, $schedule ),
			'length'     => $length,
			'maxGuesses' => $length <= 5 ? 6 : 7,
			'answer'     => spellar_encode( $word['word'], $date ),
			'fact'       => spellar_encode( $word['fact'], $date ),
			'pinned'     => $word['pinned'],
		),
		200
	);
	// Cacheable until the date ends in UTC+14. An Expires header is sent too: the host's own
	// expiry rules leave a response alone only when it already has one.
	$now     = time();
	$max_age = spellar_max_age( $date, $now );
	$response->header( 'Cache-Control', 'public, max-age=' . $max_age );
	$response->header( 'Expires', gmdate( 'D, d M Y H:i:s', $now + $max_age ) . ' GMT' );
	return $response;
}

/**
 * The counters an event adds, or an error message. Mirrors metricsFor() in bin/lib/puzzle.mjs.
 *
 * @return array{date:string, metrics:string[]}|string
 */
function spellar_event_metrics( $event, $schedule ) {
	$types = array( 'start', 'finish', 'share', 'french_click' );
	if ( ! is_array( $event ) || ! isset( $event['type'] ) || ! in_array( $event['type'], $types, true ) ) {
		return 'unknown event type';
	}
	$today = spellar_utc_today();
	if ( 'french_click' === $event['type'] ) {
		return array(
			'date'    => $today,
			'metrics' => array( 'french_clicks' ),
		);
	}

	$number       = isset( $event['number'] ) ? $event['number'] : null;
	$today_number = spellar_puzzle_number( $today, $schedule );
	if ( ! is_int( $number ) || $number < 1 || $number < $today_number - 1 || $number > $today_number + 1 ) {
		return 'puzzle number out of range';
	}
	$date = spellar_add_days( $schedule['launch'], $number - 1 );

	if ( 'start' === $event['type'] ) {
		if ( ! isset( $event['returning_d1'], $event['veteran'] ) || ! is_bool( $event['returning_d1'] ) || ! is_bool( $event['veteran'] ) ) {
			return 'start needs returning_d1 and veteran';
		}
		$metrics = array( 'starts' );
		if ( $event['returning_d1'] ) {
			$metrics[] = 'returning_d1';
		}
		if ( $event['veteran'] ) {
			$metrics[] = 'veterans';
		}
		return compact( 'date', 'metrics' );
	}

	if ( 'finish' === $event['type'] ) {
		if ( ! isset( $event['won'] ) || ! is_bool( $event['won'] ) ) {
			return 'finish needs won';
		}
		$guesses = isset( $event['guesses'] ) ? $event['guesses'] : null;
		if ( ! is_int( $guesses ) || $guesses < 1 || $guesses > 7 ) {
			return 'guesses must be 1-7';
		}
		$metrics = $event['won'] ? array( 'finishes', 'wins', 'guesses_' . $guesses ) : array( 'finishes', 'losses' );
		return compact( 'date', 'metrics' );
	}

	return array(
		'date'    => $date,
		'metrics' => array( 'shares' ),
	);
}

/**
 * At most SPELLAR_EVENT_LIMIT events a UTC day per address. The address is never stored: only a
 * salted hash of it appears, as part of a transient's name, and the transient expires at the end
 * of the day. Nothing about the address reaches the stats table.
 */
function spellar_rate_limited() {
	$ip    = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : ''; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
	$today = spellar_utc_today();
	$key   = 'spellar_rl_' . substr( hash_hmac( 'sha256', $ip . '|' . $today, wp_salt( 'nonce' ) ), 0, 24 );
	$count = (int) get_transient( $key );
	if ( $count >= SPELLAR_EVENT_LIMIT ) {
		return true;
	}
	$until_midnight = spellar_date_ts( spellar_add_days( $today, 1 ) ) - time();
	set_transient( $key, $count + 1, max( 60, $until_midnight ) );
	return false;
}

function spellar_rest_event( WP_REST_Request $request ) {
	$schedule = spellar_schedule();
	if ( ! $schedule ) {
		return spellar_rest_error( 503, 'spellar_no_puzzle', 'No puzzle is available.' );
	}
	$result = spellar_event_metrics( $request->get_json_params(), $schedule );
	if ( is_string( $result ) ) {
		return spellar_rest_error( 400, 'spellar_bad_event', $result );
	}
	if ( spellar_rate_limited() ) {
		return spellar_rest_error( 429, 'spellar_rate_limited', 'Too many events today.' );
	}
	spellar_count( $result['date'], $result['metrics'] );
	$response = new WP_REST_Response( array( 'ok' => true ), 200 );
	$response->header( 'Cache-Control', 'no-store' );
	return $response;
}
