<?php
// Dev check (run by dev/playground-admin.json in WordPress Playground): renders Tools → Spellar and
// the report the CLI prints, with some counters and a fallback date filled in, into dev/out/.
require '/wordpress/wp-load.php';
wp_set_current_user( 1 );
$today = spellar_utc_today();
spellar_count( $today, array( 'starts', 'starts', 'finishes', 'wins', 'guesses_4', 'returning_d1', 'shares' ) );
spellar_count( spellar_add_days( $today, -1 ), array( 'starts', 'finishes', 'losses', 'veterans', 'french_clicks' ) );
update_option( 'spellar_fallback_dates', array( $today ), false );
ob_start();
spellar_admin_page();
do_action( 'admin_notices' );
$out = WP_PLUGIN_DIR . '/spellar/dev/out/';
file_put_contents( $out . 'admin-page.html', '<!doctype html><meta charset=utf-8><style>body{font:13px sans-serif;padding:16px} table{border-collapse:collapse} td,th{border:1px solid #ccc;padding:3px 6px}</style>' . ob_get_clean() );
file_put_contents( $out . 'report.json', wp_json_encode( array( 'report' => spellar_report( 3 ), 'warnings' => spellar_schedule_warnings(), 'days_left' => spellar_schedule_days_left() ), JSON_PRETTY_PRINT ) );
