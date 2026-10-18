<?php
/**
 * Runs only when Spellar is deleted from the Plugins screen (not on deactivation): removes the
 * counters table, the plugin's options and any rate-limit transients still waiting to expire.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

global $wpdb;
$wpdb->query( "DROP TABLE IF EXISTS {$wpdb->prefix}spellar_daily" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
delete_option( 'spellar_db_version' );
delete_option( 'spellar_fallback_dates' );
$wpdb->query( "DELETE FROM {$wpdb->options} WHERE option_name LIKE '\\_transient\\_spellar\\_rl\\_%' OR option_name LIKE '\\_transient\\_timeout\\_spellar\\_rl\\_%'" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
