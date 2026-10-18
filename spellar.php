<?php
/**
 * Plugin Name:       Spellar
 * Plugin URI:        https://github.com/AidanSchreder/Spellar
 * Description:       A daily space word puzzle for SEDS Canada. Put [spellar] on a page to show it. Anonymous play counts under Tools → Spellar.
 * Version:           1.0.0
 * Requires at least: 6.3
 * Requires PHP:      7.4
 * Author:            SEDS Canada
 * License:           GPL-2.0-or-later
 * Text Domain:       spellar
 *
 * What it adds to the site:
 *   - the [spellar] shortcode, which prints one <div> and loads the game's files on that page only;
 *   - two REST routes, GET /wp-json/spellar/v1/puzzle and POST /wp-json/spellar/v1/event;
 *   - one table, {prefix}spellar_daily, holding daily counters (no player data);
 *   - Tools → Spellar (the counters) and the WP-CLI command `wp spellar`;
 *   - a script of under 1 KB printed on every page, which adds a dot to a menu item with the class
 *     "spellar-menu-item" (there is none until someone adds it).
 * Deactivating removes all of that except the table, which only an uninstall deletes.
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SPELLAR_VERSION', '1.0.0' );
define( 'SPELLAR_FILE', __FILE__ );
define( 'SPELLAR_DIR', plugin_dir_path( __FILE__ ) );
define( 'SPELLAR_URL', plugin_dir_url( __FILE__ ) );

require_once SPELLAR_DIR . 'includes/schedule.php';
require_once SPELLAR_DIR . 'includes/stats.php';
require_once SPELLAR_DIR . 'includes/rest.php';

register_activation_hook( __FILE__, 'spellar_install_table' );

/* ---- The game's files, on the game's page only ---- */

/** A version string that changes whenever the file does, so browsers and the page cache pick up deploys. */
function spellar_asset_version( $relative ) {
	$path = SPELLAR_DIR . $relative;
	return file_exists( $path ) ? (string) filemtime( $path ) : SPELLAR_VERSION;
}

/** True on a page whose content holds the shortcode, in the editor's text or in Elementor's data. */
function spellar_page_has_game() {
	if ( ! is_singular() ) {
		return false;
	}
	$post = get_queried_object();
	if ( ! $post instanceof WP_Post ) {
		return false;
	}
	if ( has_shortcode( $post->post_content, 'spellar' ) ) {
		return true;
	}
	$elementor = get_post_meta( $post->ID, '_elementor_data', true );
	return is_string( $elementor ) && false !== strpos( $elementor, '[spellar' );
}

function spellar_enqueue_assets() {
	if ( wp_script_is( 'spellar', 'enqueued' ) ) {
		return;
	}
	$footer = array(
		'in_footer' => true,
		'strategy'  => 'defer',
	);
	wp_enqueue_style( 'spellar', SPELLAR_URL . 'assets/spellar.css', array(), spellar_asset_version( 'assets/spellar.css' ) );
	wp_enqueue_script( 'spellar-gsap', SPELLAR_URL . 'assets/vendor/gsap.min.js', array(), spellar_asset_version( 'assets/vendor/gsap.min.js' ), $footer );
	wp_enqueue_script( 'spellar-drawsvg', SPELLAR_URL . 'assets/vendor/DrawSVGPlugin.min.js', array( 'spellar-gsap' ), spellar_asset_version( 'assets/vendor/DrawSVGPlugin.min.js' ), $footer );
	wp_enqueue_script( 'spellar', SPELLAR_URL . 'assets/spellar.js', array( 'spellar-gsap', 'spellar-drawsvg' ), spellar_asset_version( 'assets/spellar.js' ), $footer );
}

add_action(
	'wp_enqueue_scripts',
	function () {
		if ( spellar_page_has_game() ) {
			spellar_enqueue_assets();
		}
	}
);

// The site's Asset CleanUp plugin combines scripts, and after a deploy it once printed the game's
// page without the GSAP files at all. Its own opt-out, a data-wpacu-skip attribute, makes it leave
// these tags exactly as WordPress prints them (deferred, in dependency order). Its settings are
// not touched.
function spellar_skip_combining( $tag, $handle ) {
	if ( in_array( $handle, array( 'spellar', 'spellar-gsap', 'spellar-drawsvg' ), true ) && false === strpos( $tag, 'data-wpacu-skip' ) ) {
		$tag = preg_replace( '/<(script|link)\b/', '<$1 data-wpacu-skip="1"', $tag, 1 );
	}
	return $tag;
}
add_filter( 'script_loader_tag', 'spellar_skip_combining', 10, 2 );
add_filter( 'style_loader_tag', 'spellar_skip_combining', 10, 2 );

// The display font is needed for the first paint of the wordmark.
add_action(
	'wp_head',
	function () {
		if ( spellar_page_has_game() ) {
			$font = SPELLAR_URL . 'assets/fonts/cormorant-garamond-600.woff2';
			echo '<link rel="preload" href="' . esc_url( $font ) . '" as="font" type="font/woff2" crossorigin>' . "\n";
		}
	},
	2
);

/* ---- The shortcode ---- */

function spellar_shortcode() {
	// Normally enqueued already (above); this catches a shortcode placed somewhere the check missed.
	spellar_enqueue_assets();

	$api     = rest_url( 'spellar/v1/' );
	$guesses = add_query_arg( 'ver', spellar_asset_version( 'data/guesses.txt' ), SPELLAR_URL . 'data/guesses.txt' );
	$early   = spellar_inline_file( 'assets/early.js', '</script' );

	$html  = '<div class="spellar" id="spellar-root" data-api="' . esc_url( $api ) . '" data-guesses="' . esc_url( $guesses ) . '"></div>';
	$html .= '' !== $early ? "\n<script>" . $early . "</script>\n" : '';
	$html .= '<noscript><p>Spellar needs JavaScript to play.</p></noscript>';
	return $html;
}
add_shortcode( 'spellar', 'spellar_shortcode' );

/** A small file's contents for printing inline, or '' if it is missing or could close its tag early. */
function spellar_inline_file( $relative, $closing_tag ) {
	$path = SPELLAR_DIR . $relative;
	$text = is_readable( $path ) ? trim( (string) file_get_contents( $path ) ) : '';
	return false === stripos( $text, $closing_tag ) ? $text : '';
}

/* ---- The menu dot, on every page ---- */

// The only thing Spellar prints site-wide: under 1 KB of script, no request, no dependencies. It adds
// the dot to a menu item with the class "spellar-menu-item"; without that item it does nothing.
add_action(
	'wp_footer',
	function () {
		$js = spellar_inline_file( 'assets/menu-dot.min.js', '</script' );
		if ( '' !== $js ) {
			echo '<script id="spellar-dot">' . $js . "</script>\n";
		}
	},
	20
);
