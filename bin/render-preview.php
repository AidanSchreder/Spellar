<?php
/**
 * Renders the draft game page through the theme exactly as a visitor would get it once
 * published, without publishing it: WordPress, the theme, Elementor and every plugin run as for
 * a page view, and the HTML is written to ~/spellar-deploy/preview.html. Changes nothing.
 *
 *   wp eval-file render-preview.php
 */

if ( ! defined( 'WP_CLI' ) ) {
	exit;
}

$pages = get_posts(
	array(
		'post_type'   => 'page',
		'name'        => 'spellar',
		'post_status' => 'any',
		'numberposts' => 1,
	)
);
if ( ! $pages ) {
	WP_CLI::error( 'No page with the slug "spellar".' );
}
$id     = $pages[0]->ID;
$admins = get_users(
	array(
		'role'   => 'administrator',
		'number' => 1,
		'fields' => 'ID',
	)
);

// A draft is only visible as a preview to someone who can edit it; render it as an
// administrator, but without the admin toolbar, so the HTML matches a visitor's.
wp_set_current_user( (int) $admins[0] );
show_admin_bar( false );
$_GET['page_id']        = $id;
$_GET['preview']        = 'true';
$_SERVER['REQUEST_URI'] = '/?page_id=' . $id . '&preview=true';

wp(
	array(
		'page_id' => $id,
		'preview' => 'true',
	)
);
ob_start();
require ABSPATH . WPINC . '/template-loader.php';
$html = ob_get_clean();

$out = getenv( 'HOME' ) . '/spellar-deploy/preview.html';
file_put_contents( $out, $html );
WP_CLI::success( sprintf( 'Wrote %s (%d bytes) for page %d.', $out, strlen( $html ), $id ) );
