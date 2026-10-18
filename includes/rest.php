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

/**
 * The puzzle for a date, exactly as GET /puzzle sends it, or a WP_Error (with an HTTP status in its
 * data) saying why there is none. The game's page carries the same data for the days around today
 * (spellar_page_days()).
 *
 * @return array|WP_Error
 */
function spellar_puzzle_data( $date ) {
	if ( ! spellar_is_date( $date ) ) {
		return new WP_Error( 'spellar_bad_date', 'date must be YYYY-MM-DD.', array( 'status' => 400 ) );
	}
	if ( abs( spellar_days_between( spellar_utc_today(), $date ) ) > 1 ) {
		return new WP_Error( 'spellar_date_out_of_range', 'date must be within one day of today.', array( 'status' => 400 ) );
	}
	$schedule = spellar_schedule();
	if ( $schedule && spellar_days_between( $schedule['launch'], $date ) < 0 ) {
		// A player still on the day before launch (far-west time zones on launch day).
		return new WP_Error( 'spellar_not_started', 'Spellar starts on ' . $schedule['launch'] . '.', array( 'status' => 404 ) );
	}
	$word = spellar_word_for( $date );
	if ( ! $schedule || ! $word ) {
		return new WP_Error( 'spellar_no_puzzle', 'No puzzle is available.', array( 'status' => 503 ) );
	}
	$length = strlen( $word['word'] );
	return array(
		'number'     => spellar_puzzle_number( $date, $schedule ),
		'length'     => $length,
		'maxGuesses' => $length <= 5 ? 6 : 7,
		'answer'     => spellar_encode( $word['word'], $date ),
		'fact'       => spellar_encode( $word['fact'], $date ),
		'pinned'     => $word['pinned'],
	);
}

/**
 * The puzzles for the server's yesterday, today and tomorrow (UTC), keyed by date: the same data
 * GET /puzzle gives for those dates, which it would serve anyway. Every time zone's local date is
 * one of the three for as long as a saved copy of the page is under 10 hours old (the page cache
 * keeps copies for 8), so the game starts without asking WordPress anything; when a copy is
 * older, the player's date is missing and the game falls back to GET /puzzle.
 */
function spellar_page_days() {
	$days  = array();
	$today = spellar_utc_today();
	foreach ( array( -1, 0, 1 ) as $offset ) {
		$date = spellar_add_days( $today, $offset );
		$data = spellar_puzzle_data( $date );
		if ( ! is_wp_error( $data ) ) {
			$days[ $date ] = $data;
		}
	}
	return $days;
}

function spellar_rest_puzzle( WP_REST_Request $request ) {
	$date = $request->get_param( 'date' );
	$data = spellar_puzzle_data( $date );
	if ( is_wp_error( $data ) ) {
		$status = $data->get_error_data();
		return spellar_rest_error( $status['status'], $data->get_error_code(), $data->get_error_message() );
	}

	$response = new WP_REST_Response( $data, 200 );
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
