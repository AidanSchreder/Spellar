<?php
/**
 * Creates the game page as a DRAFT: slug "spellar", title "Spellar", content only the shortcode.
 * Built like the site's other pages (Elementor, theme title hidden, full width, no sidebar), with
 * one Shortcode widget in a section with no column gap. Run once on the server:
 *
 *   wp eval-file create-page.php
 *
 * Nothing else is changed. Publishing is a separate, deliberate step (see CLAUDE.md).
 */

if ( ! defined( 'WP_CLI' ) ) {
	exit;
}

$existing = get_posts(
	array(
		'post_type'   => 'page',
		'name'        => 'spellar',
		'post_status' => 'any',
		'numberposts' => 1,
	)
);
if ( $existing ) {
	WP_CLI::error( sprintf( 'A page with the slug "spellar" already exists (ID %d, %s).', $existing[0]->ID, $existing[0]->post_status ) );
}

$elementor = array(
	array(
		'id'       => '5e11a01',
		'elType'   => 'section',
		'settings' => array( 'gap' => 'no' ),
		'elements' => array(
			array(
				'id'       => '5e11a02',
				'elType'   => 'column',
				'settings' => array( '_column_size' => 100 ),
				'elements' => array(
					array(
						'id'         => '5e11a03',
						'elType'     => 'widget',
						'settings'   => array( 'shortcode' => '[spellar]' ),
						'elements'   => array(),
						'widgetType' => 'shortcode',
					),
				),
				'isInner'  => false,
			),
		),
		'isInner'  => false,
	),
);

$id = wp_insert_post(
	array(
		'post_type'      => 'page',
		'post_status'    => 'draft',
		'post_title'     => 'Spellar',
		'post_name'      => 'spellar',
		'post_content'   => '[spellar]',
		'comment_status' => 'closed',
		'ping_status'    => 'closed',
	),
	true
);
if ( is_wp_error( $id ) ) {
	WP_CLI::error( $id->get_error_message() );
}

$meta = array(
	'_elementor_edit_mode'     => 'builder',
	'_elementor_template_type' => 'wp-page',
	'_elementor_version'       => defined( 'ELEMENTOR_VERSION' ) ? ELEMENTOR_VERSION : '',
	'_elementor_data'          => wp_slash( wp_json_encode( $elementor ) ),
	'_wp_page_template'        => 'default',
	// The theme's per-page settings, as on /events/: no page title, full-width content, no sidebar.
	'site-post-title'          => 'disabled',
	'ast-site-content-layout'  => 'default',
	'site-content-layout'      => 'page-builder',
	'site-sidebar-layout'      => 'no-sidebar',
	'ast-featured-img'         => 'disabled',
);
foreach ( $meta as $key => $value ) {
	update_post_meta( $id, $key, $value );
}

WP_CLI::success( sprintf( 'Created draft page %d (slug "%s").', $id, get_post_field( 'post_name', $id ) ) );
