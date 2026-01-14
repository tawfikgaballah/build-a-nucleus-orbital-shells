// Copyright 2022-2025, University of Colorado Boulder

/**
 * Node that represents the nucleon shells, meaning the straight horizontal lines above the buckets, in the view.
 *
 * This view Node assumes a lot of ParticleView, and how its position is based on its center (note usages of
 * BANConstants.PARTICLE_RADIUS).
 *
 * This version is fully data-driven from the passed-in shell slot arrays:
 * - Row index === shell row index (0..L-1). No dependency on EnergyLevelType.yPosition.
 * - Row capacity is computed from the number of defined slots in that row.
 * - Coloring/width is computed from *actual* occupancy of slots (pos.particle), not from nucleonCountProperty value.
 *
 * @author Luisa Vargas
 * edits: data-driven occupancy + robust indexing
 */

import { TReadOnlyProperty } from '../../../../axon/js/TReadOnlyProperty.js';
import Bounds2 from '../../../../dot/js/Bounds2.js';
import Vector2 from '../../../../dot/js/Vector2.js';
import optionize, { EmptySelfOptions } from '../../../../phet-core/js/optionize.js';
import ModelViewTransform2 from '../../../../phetcommon/js/view/ModelViewTransform2.js';
import Line from '../../../../scenery/js/nodes/Line.js';
import Node, { NodeOptions } from '../../../../scenery/js/nodes/Node.js';
import Color from '../../../../scenery/js/util/Color.js';
import buildANucleus from '../../buildANucleus.js';
import BANColors from '../../common/BANColors.js';
import BANConstants from '../../common/BANConstants.js';
import ParticleTypeEnum from '../../common/model/ParticleTypeEnum.js';
import { ParticleShellPosition } from '../model/ShellModelNucleus.js';
import Text from '../../../../scenery/js/nodes/Text.js';
import RichText from '../../../../scenery/js/nodes/RichText.js';
import EnergyLevelType from '../model/EnergyLevelType.js';


type EnergyLevelNodeOptions = EmptySelfOptions & NodeOptions;

class NucleonShellView extends Node {

  /**
   * Convert simple LaTeX-like subscript/superscript syntax to RichText HTML tags.
   * E.g., "1s_{1/2}" -> "1s<sub>1/2</sub>" and "n^{2}" -> "n<sup>2</sup>".
   */
  private static latexToRichText( s: string ): string {
    if ( /<[^>]+>/.test( s ) ) { return s; } // already RichText-like
    let t = s.replace(/_\{([^}]+)\}/g, '<sub>$1</sub>');
    t = t.replace(/\^\{([^}]+)\}/g, '<sup>$1</sup>');
    t = t.replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>');
    t = t.replace(/\^([A-Za-z0-9])/g, '<sup>$1</sup>');
    return t;
  }

  public constructor(
    particleType: ParticleTypeEnum,
    nucleonShellPositions: ParticleShellPosition[][],
    nucleonCountProperty: TReadOnlyProperty<number>,
    modelViewTransform: ModelViewTransform2,
    providedOptions?: EnergyLevelNodeOptions
  ) {

    assert && assert(
      particleType === ParticleTypeEnum.NEUTRON || particleType === ParticleTypeEnum.PROTON,
      'only protons and neutrons supported in NucleonShellView'
    );

    const options = optionize<EnergyLevelNodeOptions, EmptySelfOptions, NodeOptions>()( {}, providedOptions );
    super( options );

    // Color when the layer is completely empty.
    const emptyLayerColor = BANColors.zeroNucleonsEnergyLevelColorProperty.value;

    // Color when the layer is completely full.
    const fullLayerColor = particleType === ParticleTypeEnum.NEUTRON ?
                           BANColors.neutronColorProperty.value :
                           BANColors.protonColorProperty.value;

    const boldEnergyLevelWidth = 4;
    const defaultEnergyLevelWidth = 1;

        // Build the shell lines (one per row). Row index is the authoritative index.
    const energyLevels: Line[] = [];
    const energyLevelLabels: Node[] = [];

    // Precompute per-row capacities from the slot arrays (defined entries).
    const rowCapacities: number[] = nucleonShellPositions.map( row =>
      row.filter( p => p !== undefined ).length
    );


    nucleonShellPositions.forEach( ( particleShellRow, rowIndex ) => {

      const definedPositions = particleShellRow.filter( p => p !== undefined );
      assert && assert( definedPositions.length > 0, 'Energy level row has no defined positions' );

      const minX = Math.min( ...definedPositions.map( p => p.xPosition ) );
      const maxX = Math.max( ...definedPositions.map( p => p.xPosition ) );

      const yView = modelViewTransform.modelToViewY( rowIndex ) + BANConstants.PARTICLE_RADIUS;

      const lineStartingPoint = new Vector2(
        modelViewTransform.modelToViewX( minX ) - BANConstants.PARTICLE_RADIUS,
        yView
      );

      const lineEndingPoint = new Vector2(
        modelViewTransform.modelToViewX( maxX ) + BANConstants.PARTICLE_RADIUS,
        yView
      );

      // Start empty by default
      const line = new Line( lineStartingPoint, lineEndingPoint, {
        stroke: emptyLayerColor,
        lineWidth: defaultEnergyLevelWidth
      } );
      energyLevels.push( line );

      // --- NEW: label for this row ---
      // If EnergyLevelType.ENERGY_LEVELS is aligned with rows, use it; otherwise fall back.
      const level = EnergyLevelType.ENERGY_LEVELS[ rowIndex ];
      const labelString = level ? level.label : `Level ${rowIndex}`;
      const cap = rowCapacities[ rowIndex ];

      // Convert LaTeX-like subscripts/superscripts to RichText (<sub>/<sup>) and render with RichText.
      const richLabelText = NucleonShellView.latexToRichText( labelString );
      const label = new RichText( `${richLabelText} (${cap})`, {
        font: BANConstants.LEGEND_FONT,
        fill: 'black',
        maxWidth: 80
      } );

      // Place label just left of the line.
      label.right = lineStartingPoint.x - 8;
      label.centerY = yView;

      energyLevelLabels.push( label );
} );

energyLevels.forEach( line => this.addChild( line ) );
energyLevelLabels.forEach( label => this.addChild( label ) );


    // Count occupied shell slots across all rows.
    const countParticlesInShell = (): number => {
      let total = 0;
      for ( const row of nucleonShellPositions ) {
        for ( const pos of row ) {
          if ( pos && pos.particle ) {
            total++;
          }
        }
      }
      return total;
    };

    // Update ALL lines when the model count changes (count is only a trigger; occupancy is the source of truth).
    nucleonCountProperty.link( () => {

      let remaining = countParticlesInShell();

      for ( let rowIndex = 0; rowIndex < energyLevels.length; rowIndex++ ) {

        const cap = rowCapacities[ rowIndex ];
        assert && assert( cap > 0, `Row ${rowIndex} has non-positive capacity.` );

        const filled = Math.max( 0, Math.min( cap, remaining ) );

        const t = cap > 0 ? filled / cap : 0;
        const clampedT = Math.max( 0, Math.min( 1, t ) );

        energyLevels[ rowIndex ].stroke = Color.interpolateRGBA( emptyLayerColor, fullLayerColor, clampedT );
        energyLevels[ rowIndex ].lineWidth = ( filled === cap ) ? boldEnergyLevelWidth : defaultEnergyLevelWidth;

        remaining -= cap;
      }
    } );
  }

  /**
   * The bounds of this node doesn't account for the particles that sit on top of the top energy level line, so we need
   * to dilate the capture area above this Node more than below it.
   * Created in https://github.com/phetsims/build-a-nucleus/issues/194
   */
  public getCaptureAreaBounds(): Bounds2 {
    const dilated = this.bounds.dilated( BANConstants.PARTICLE_DIAMETER );

    // Keep the behavior consistent with existing code: shift capture area upward to include particles above the top line.
    // If your Bounds2 implementation does not support offset( left, top, right, bottom ), replace this with dilated.shiftedY( ... )
    // or adjust as needed for your dot version.
    return ( dilated as any ).offset ?
           ( dilated as any ).offset( 0, BANConstants.PARTICLE_DIAMETER, 0, 0 ) :
           dilated.shiftedY( -BANConstants.PARTICLE_DIAMETER );
  }
}

buildANucleus.register( 'NucleonShellView', NucleonShellView );
export default NucleonShellView;
