<?php
/**
 * Anonymous, aggregate play counts: one row per (date, metric), incremented in place. No player
 * IDs, no addresses, no cookies. Viewable under Tools → Spellar and with `wp spellar stats`.
 *
 * The table is created on activation and kept on deactivation; only uninstall.php drops it.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const SPELLAR_DB_VERSION = 1;

const SPELLAR_METRICS = array(
	'starts', 'finishes', 'wins', 'losses',
	'guesses_1', 'guesses_2', 'guesses_3', 'guesses_4', 'guesses_5', 'guesses_6', 'guesses_7',
	'returning_d1', 'veterans', 'shares', 'french_clicks',
);

function spellar_table() {
	global $wpdb;
	return $wpdb->prefix . 'spellar_daily';
}

function spellar_install_table() {
	global $wpdb;
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	$table   = spellar_table();
	$charset = $wpdb->get_charset_collate();
	// dbDelta wants two spaces after PRIMARY KEY. The primary key is the unique key on (date, metric).
	dbDelta(
		"CREATE TABLE {$table} (
  date date NOT NULL,
  metric varchar(32) NOT NULL,
  value bigint(20) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY  (date,metric)
) {$charset};"
	);
	update_option( 'spellar_db_version', SPELLAR_DB_VERSION, false );
}

// Recreate the table if it went missing (for example after a database restore from before the plugin).
add_action(
	'admin_init',
	function () {
		if ( (int) get_option( 'spellar_db_version' ) !== SPELLAR_DB_VERSION ) {
			spellar_install_table();
		}
	}
);

function spellar_count( $date, array $metrics ) {
	global $wpdb;
	$table = spellar_table();
	foreach ( $metrics as $metric ) {
		if ( ! in_array( $metric, SPELLAR_METRICS, true ) ) {
			continue;
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- the table name is ours
		$wpdb->query( $wpdb->prepare( "INSERT INTO {$table} (date, metric, value) VALUES (%s, %s, 1) ON DUPLICATE KEY UPDATE value = value + 1", $date, $metric ) );
	}
}

/**
 * Counters for the last $days UTC days (newest first) and the all-time totals.
 *
 * @return array{days: array<string, array<string,int>>, totals: array<string,int>}
 */
function spellar_stats( $days = 30 ) {
	global $wpdb;
	$table = spellar_table();
	$days  = max( 1, min( 3650, (int) $days ) );
	$from  = spellar_add_days( spellar_utc_today(), 1 - $days );
	// phpcs:disable WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	$rows   = $wpdb->get_results( $wpdb->prepare( "SELECT date, metric, value FROM {$table} WHERE date >= %s ORDER BY date DESC", $from ), ARRAY_A );
	$totals = $wpdb->get_results( "SELECT metric, SUM(value) AS value FROM {$table} GROUP BY metric", ARRAY_A );
	// phpcs:enable

	$empty = array_fill_keys( SPELLAR_METRICS, 0 );
	$out   = array();
	for ( $i = 0; $i < $days; $i++ ) {
		$out[ spellar_add_days( spellar_utc_today(), -$i ) ] = $empty;
	}
	foreach ( (array) $rows as $row ) {
		if ( isset( $out[ $row['date'] ] ) && isset( $empty[ $row['metric'] ] ) ) {
			$out[ $row['date'] ][ $row['metric'] ] = (int) $row['value'];
		}
	}
	$all = $empty;
	foreach ( (array) $totals as $row ) {
		if ( isset( $all[ $row['metric'] ] ) ) {
			$all[ $row['metric'] ] = (int) $row['value'];
		}
	}
	return array(
		'days'   => $out,
		'totals' => $all,
	);
}

/** One table row of the report, the same columns for the admin page and the CLI. */
function spellar_report_row( $label, $puzzle, array $m ) {
	$rate = $m['finishes'] ? round( 100 * $m['wins'] / $m['finishes'] ) . '%' : '–';
	$dist = array();
	for ( $g = 1; $g <= 7; $g++ ) {
		$dist[] = $m[ 'guesses_' . $g ];
	}
	return array(
		'date'         => $label,
		'puzzle'       => $puzzle,
		'starts'       => $m['starts'],
		'finishes'     => $m['finishes'],
		'win_rate'     => $rate,
		'guesses_1_7'  => implode( ' ', $dist ),
		'losses'       => $m['losses'],
		'returning_d1' => $m['returning_d1'],
		'veterans'     => $m['veterans'],
		'shares'       => $m['shares'],
		'french'       => $m['french_clicks'],
	);
}

function spellar_report( $days = 30 ) {
	$stats    = spellar_stats( $days );
	$schedule = spellar_schedule();
	$rows     = array();
	foreach ( $stats['days'] as $date => $m ) {
		$number = $schedule ? spellar_puzzle_number( $date, $schedule ) : 0;
		$rows[] = spellar_report_row( $date, $number >= 1 ? '#' . $number : '', $m );
	}
	$rows[] = spellar_report_row( 'All time', '', $stats['totals'] );
	return $rows;
}

const SPELLAR_REPORT_HEADINGS = array(
	'date'         => 'Date',
	'puzzle'       => 'Puzzle',
	'starts'       => 'Starts',
	'finishes'     => 'Finishes',
	'win_rate'     => 'Win rate',
	'guesses_1_7'  => 'Wins in 1–7 guesses',
	'losses'       => 'Losses',
	'returning_d1' => 'Returning (played yesterday)',
	'veterans'     => 'Veterans (first play 7+ days ago)',
	'shares'       => 'Shares',
	'french'       => 'Français clicks',
);

/* ---- Tools → Spellar ---- */

add_action(
	'admin_menu',
	function () {
		add_management_page( 'Spellar', 'Spellar', 'manage_options', 'spellar', 'spellar_admin_page' );
	}
);

function spellar_admin_page() {
	if ( ! current_user_can( 'manage_options' ) ) {
		return;
	}
	$rows     = spellar_report( 30 );
	$schedule = spellar_schedule();
	echo '<div class="wrap"><h1>Spellar</h1>';
	echo '<p>Anonymous counts only: no player IDs, no IP addresses, no cookies. Game events are counted on the puzzle\'s date; Français clicks on the UTC date. Each browser sends each event at most once a day.</p>';
	if ( $schedule ) {
		printf(
			'<p>Puzzle #1 was %s. The schedule covers %d more days.</p>',
			esc_html( $schedule['launch'] ),
			(int) spellar_schedule_days_left()
		);
	}
	echo '<table class="widefat striped"><thead><tr>';
	foreach ( SPELLAR_REPORT_HEADINGS as $heading ) {
		echo '<th scope="col">' . esc_html( $heading ) . '</th>';
	}
	echo '</tr></thead><tbody>';
	foreach ( $rows as $i => $row ) {
		$last = count( $rows ) - 1 === $i;
		echo $last ? '<tr style="font-weight:600">' : '<tr>';
		foreach ( $row as $value ) {
			echo '<td>' . esc_html( (string) $value ) . '</td>';
		}
		echo '</tr>';
	}
	echo '</tbody></table>';
	echo '<p>From the command line: <code>wp spellar stats --days=30</code></p></div>';
}

// Shown in WP admin to administrators when the schedule needs attention.
add_action(
	'admin_notices',
	function () {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		foreach ( spellar_schedule_warnings() as $warning ) {
			echo '<div class="notice notice-warning"><p><strong>Spellar:</strong> ' . esc_html( $warning ) . '</p></div>';
		}
	}
);

/* ---- WP-CLI ---- */

if ( defined( 'WP_CLI' ) && WP_CLI ) {
	/**
	 * Spellar: anonymous play counts and schedule status.
	 */
	class Spellar_CLI {
		/**
		 * Prints the daily counters for the last N days and the all-time totals.
		 *
		 * ## OPTIONS
		 *
		 * [--days=<days>]
		 * : How many days to show, counting back from today (UTC).
		 * ---
		 * default: 30
		 * ---
		 *
		 * [--format=<format>]
		 * : table, csv or json.
		 * ---
		 * default: table
		 * ---
		 *
		 * ## EXAMPLES
		 *
		 *     wp spellar stats
		 *     wp spellar stats --days=7
		 *
		 * @when after_wp_load
		 */
		public function stats( $args, $assoc ) {
			foreach ( spellar_schedule_warnings() as $warning ) {
				WP_CLI::warning( $warning );
			}
			$rows = spellar_report( isset( $assoc['days'] ) ? (int) $assoc['days'] : 30 );
			WP_CLI\Utils\format_items( isset( $assoc['format'] ) ? $assoc['format'] : 'table', $rows, array_keys( SPELLAR_REPORT_HEADINGS ) );
		}

		/**
		 * Shows the schedule's launch date and how far ahead it runs.
		 *
		 * @when after_wp_load
		 */
		public function schedule() {
			$schedule = spellar_schedule();
			if ( ! $schedule ) {
				WP_CLI::error( 'data/schedule.json is missing or unreadable.' );
			}
			$dates = array_keys( $schedule['days'] );
			sort( $dates, SORT_STRING );
			WP_CLI::log( sprintf( 'Launch (puzzle #1): %s', $schedule['launch'] ) );
			WP_CLI::log( sprintf( 'Scheduled: %s to %s (%d days left after today, UTC)', $dates[0], end( $dates ), spellar_schedule_days_left() ) );
			WP_CLI::log( sprintf( 'Today (UTC %s) is puzzle #%d.', spellar_utc_today(), spellar_puzzle_number( spellar_utc_today(), $schedule ) ) );
			$warnings = spellar_schedule_warnings();
			foreach ( $warnings as $warning ) {
				WP_CLI::warning( $warning );
			}
			if ( ! $warnings ) {
				WP_CLI::success( 'Schedule OK.' );
			}
		}

		/**
		 * Clears the page cache's saved copies of the game page (after a deploy), if WP Super Cache is active.
		 *
		 * @when after_wp_load
		 */
		public function flush_page() {
			$page = get_page_by_path( 'spellar' );
			if ( ! $page ) {
				WP_CLI::warning( 'No page with the slug "spellar".' );
				return;
			}
			if ( ! function_exists( 'wpsc_delete_url_cache' ) ) {
				WP_CLI::warning( 'WP Super Cache is not active; nothing to clear.' );
				return;
			}
			wpsc_delete_url_cache( get_permalink( $page ) );
			WP_CLI::success( 'Cleared the saved copies of ' . get_permalink( $page ) );
		}
	}
	WP_CLI::add_command( 'spellar', 'Spellar_CLI' );
}
