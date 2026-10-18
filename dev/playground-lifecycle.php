<?php
// Dev check (run by dev/playground-lifecycle.json in WordPress Playground): the table survives
// deactivation, and uninstall.php removes the table, the options and the rate-limit transients.
require '/wordpress/wp-load.php';
require_once ABSPATH . 'wp-admin/includes/plugin.php';
global $wpdb;
$t   = $wpdb->prefix . 'spellar_daily';
$log = array();

spellar_count( spellar_utc_today(), array( 'starts' ) );
$log['rows_after_activate'] = (int) $wpdb->get_var( "SELECT SUM(value) FROM $t" );

deactivate_plugins( 'spellar/spellar.php' );
$log['active_after_deactivate'] = is_plugin_active( 'spellar/spellar.php' );
$log['rows_after_deactivate']   = (int) $wpdb->get_var( "SELECT SUM(value) FROM $t" );

set_transient( 'spellar_rl_test', 3, 600 );
$like = $wpdb->esc_like( 'spellar_rl_test' );
$log['transient_rows_before_uninstall'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s", '%' . $like ) );

define( 'WP_UNINSTALL_PLUGIN', 'spellar/spellar.php' );
include WP_PLUGIN_DIR . '/spellar/uninstall.php';
$wpdb->suppress_errors( true );
$log['table_after_uninstall']          = $wpdb->get_var( "SELECT COUNT(*) FROM $t" );
$log['db_version_after_uninstall']     = get_option( 'spellar_db_version', 'gone' );
$log['transient_rows_after_uninstall'] = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->options} WHERE option_name LIKE %s", '%' . $like ) );

file_put_contents( WP_PLUGIN_DIR . '/spellar/dev/out/lifecycle.json', wp_json_encode( $log, JSON_PRETTY_PRINT ) );
