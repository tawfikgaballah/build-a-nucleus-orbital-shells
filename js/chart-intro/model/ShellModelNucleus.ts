// Copyright 2022-2025, University of Colorado Boulder

/**
 * A model element that represents a nucleus that is made up of protons and neutrons. This model element
 * manages the positions and motion of all particles that are a part of the nucleus.
 *
 * Orbital-driven refactor:
 * - Data-driven from EnergyLevelType.ENERGY_LEVELS (orbitals like 1s1/2, 1p3/2, ...).
 * - Supports any number of orbitals and capacities.
 * - Uses ROW INDEX (0..L-1) everywhere; does NOT rely on EnergyLevelType.yPosition or "N_ZERO" style enums.
 * - Preserves incoming-particle reservation behavior (view can count occupied shell slots during animation).
 * - Uses contiguous x slots per row (0..cap-1), preventing the historical He→Li visual artifact.
 *
 * Compatibility exports:
 * - N_ZERO_CAPACITY / N_ONE_CAPACITY / N_TWO_CAPACITY / N_THREE_CAPACITY for legacy view code (e.g. NuclideChartNode).
 *   These are computed by orbital labels (update label lists if you change EnergyLevelType labels).
 *
 * Notes:
 * - The "binding/squeeze" effect is kept, but is controlled by a reached-row index (NumberProperty).
 * - If you want to disable binding entirely, search for "BINDING EFFECT" and set `bindingEnabled = false`.
 *
 * @author Marla Schulz (PhET Interactive Simulations)
 * @author Luisa Vargas
 * edits: user-requested orbital capacities + robust placement
 */

import { ObservableArray } from '../../../../axon/js/createObservableArray.js';
import NumberProperty from '../../../../axon/js/NumberProperty.js';
import Bounds2 from '../../../../dot/js/Bounds2.js';
import Vector2 from '../../../../dot/js/Vector2.js';
import ModelViewTransform2 from '../../../../phetcommon/js/view/ModelViewTransform2.js';
import Particle, { ParticleType } from '../../../../shred/js/model/Particle.js';
import ParticleAtom from '../../../../shred/js/model/ParticleAtom.js';
import Tandem from '../../../../tandem/js/Tandem.js';
import buildANucleus from '../../buildANucleus.js';
import BANConstants from '../../common/BANConstants.js';
import BANParticle from '../../common/model/BANParticle.js';
import ParticleTypeEnum from '../../common/model/ParticleTypeEnum.js';
import EnergyLevelType from './EnergyLevelType.js';

// ----------------------------------------------------------------------------------------
// Orbitals (ENERGY_LEVELS) - normalized and validated
// ----------------------------------------------------------------------------------------

const ENERGY_LEVELS = EnergyLevelType.ENERGY_LEVELS.filter(
  ( level ): level is EnergyLevelType => level !== undefined
);

assert && assert(
  ENERGY_LEVELS.length > 0 && ENERGY_LEVELS.every( l => !!l && l.capacity > 0 ),
  'EnergyLevelType.ENERGY_LEVELS must be non-empty and contain only defined levels with positive capacity.'
);

// ----------------------------------------------------------------------------------------
// Compatibility: "major shell" capacities used by some view code (e.g., NuclideChartNode.ts)
// ----------------------------------------------------------------------------------------
//
// These are computed from orbital labels to avoid relying on specific static member names.
// If you change labels in EnergyLevelType.ts, update these label lists accordingly.

const sumCapByLabels = ( labels: readonly string[] ): number => {
  const capMap = new Map<string, number>();
  ENERGY_LEVELS.forEach( l => capMap.set( l.label, l.capacity ) );

  let sum = 0;
  labels.forEach( label => {
    const cap = capMap.get( label );
    assert && assert( cap !== undefined, `Missing orbital "${label}" in EnergyLevelType.ENERGY_LEVELS` );
    sum += cap || 0;
  } );
  return sum;
};

// Major shells (2, 8, 20, 40, ...) correspond to cumulative sums of these groups.
export const N_ZERO_CAPACITY = sumCapByLabels( [ '1s_{1/2}' ] ); // 2
export const N_ONE_CAPACITY = sumCapByLabels( [ '1p_{3/2}', '1p_{1/2}' ] ); // 6
export const N_TWO_CAPACITY = sumCapByLabels( [ '1d_{5/2}', '2s_{1/2}', '1d_{3/2}' ] ); // 12
export const N_THREE_CAPACITY = sumCapByLabels( [ '1f_{7/2}', '2p_{3/2}', '1f_{5/2}', '2p_{1/2}' ] ); // 20

export const TOTAL_CAPACITY = ENERGY_LEVELS.reduce( ( s, l ) => s + l.capacity, 0 );
export const MAX_LEVEL_CAPACITY = Math.max( ...ENERGY_LEVELS.map( level => level.capacity ) );

// ----------------------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------------------

export type ParticleShellPosition = {
  particle?: Particle;
  xPosition: number; // 0..(capacity-1) for the row
  type: ParticleTypeEnum;
};

// ----------------------------------------------------------------------------------------
// Geometry / transforms
// ----------------------------------------------------------------------------------------

const PARTICLE_RADIUS = BANConstants.PARTICLE_RADIUS;
const PARTICLE_DIAMETER = BANConstants.PARTICLE_DIAMETER;
const PARTICLE_X_SPACING = PARTICLE_RADIUS;

const NUMBER_OF_ENERGY_LEVELS = ENERGY_LEVELS.length;
const NUMBER_OF_Y_SPACINGS = Math.max( 0, NUMBER_OF_ENERGY_LEVELS - 1 );

// Target maximum total stack height in view coordinates (tune if desired).
// This prevents additional orbitals from pushing lower rows off-screen.
const MAX_STACK_HEIGHT = 260;

// One "row step" is (PARTICLE_DIAMETER + PARTICLE_Y_SPACING).
// Compute a step that keeps the full stack within MAX_STACK_HEIGHT.
const rowStep = NUMBER_OF_Y_SPACINGS > 0 ?
  Math.min( PARTICLE_DIAMETER * 5, MAX_STACK_HEIGHT / NUMBER_OF_Y_SPACINGS ) :
  ( PARTICLE_DIAMETER * 5 );

// Convert desired rowStep into the "extra spacing" parameter used elsewhere.
const PARTICLE_Y_SPACING = Math.max( 0, rowStep - PARTICLE_DIAMETER );


const NUMBER_OF_RADII_SPACES_BETWEEN_PARTICLES = Math.max( 1, MAX_LEVEL_CAPACITY - 1 );

const PARTICLE_POSITIONING_TRANSFORM = ModelViewTransform2.createRectangleInvertedYMapping(
  new Bounds2( 0, 0, NUMBER_OF_RADII_SPACES_BETWEEN_PARTICLES, NUMBER_OF_Y_SPACINGS ),
  new Bounds2(
    0,
    0,
    ( PARTICLE_DIAMETER + PARTICLE_X_SPACING ) * NUMBER_OF_RADII_SPACES_BETWEEN_PARTICLES,
    ( PARTICLE_DIAMETER + PARTICLE_Y_SPACING ) * NUMBER_OF_Y_SPACINGS
  )
);

// ----------------------------------------------------------------------------------------
// Allowed shell slots (contiguous indices per row)
// ----------------------------------------------------------------------------------------

const ALLOWED_PARTICLE_POSITIONS: number[][] = ENERGY_LEVELS.map( level =>
  Array.from( { length: level.capacity }, ( _, i ) => i )
);

assert && assert( ALLOWED_PARTICLE_POSITIONS.length === ENERGY_LEVELS.length, 'Energy levels should match' );

for ( let row = 0; row < ENERGY_LEVELS.length; row++ ) {
  assert && assert(
    ALLOWED_PARTICLE_POSITIONS[ row ].length === ENERGY_LEVELS[ row ].capacity,
    `Row ${row} capacity mismatch.`
  );
}

// ----------------------------------------------------------------------------------------
// Helpers (row-index based, NOT yPosition-based)
// ----------------------------------------------------------------------------------------

const getCapacityBelowRow = ( rowIndex: number ): number => {
  let sum = 0;
  for ( let i = 0; i < rowIndex; i++ ) {
    sum += ENERGY_LEVELS[ i ].capacity;
  }
  return sum;
};

const getRowIndexForGlobalIndex = ( index0Based: number ): number => {
  let r = index0Based;
  for ( let i = 0; i < ENERGY_LEVELS.length; i++ ) {
    r -= ENERGY_LEVELS[ i ].capacity;
    if ( r < 0 ) {
      return i;
    }
  }
  assert && assert( false, `index out of supported range: ${index0Based}` );
  return ENERGY_LEVELS.length - 1;
};

const getReachedRowIndexForCount = ( nucleonCount: number ): number => {
  const safeCount = Math.max( 0, nucleonCount );
  let running = 0;

  for ( let i = 0; i < ENERGY_LEVELS.length; i++ ) {
    running += ENERGY_LEVELS[ i ].capacity;

    // when count equals cumulative capacity, we are at the end of that row
    if ( safeCount <= running ) {
      return i;
    }
  }
  return ENERGY_LEVELS.length - 1;
};

// ----------------------------------------------------------------------------------------
// ShellModelNucleus
// ----------------------------------------------------------------------------------------

class ShellModelNucleus extends ParticleAtom {

  public readonly protonShellPositions: ParticleShellPosition[][] =
    Array.from( { length: ALLOWED_PARTICLE_POSITIONS.length }, () => [] );

  public readonly neutronShellPositions: ParticleShellPosition[][] =
    Array.from( { length: ALLOWED_PARTICLE_POSITIONS.length }, () => [] );

  public readonly modelViewTransform = PARTICLE_POSITIONING_TRANSFORM;

  // Reached row index controls binding on rows strictly below this value.
  private readonly protonsReachedRowIndexProperty = new NumberProperty( 0 );
  private readonly neutronsReachedRowIndexProperty = new NumberProperty( 0 );

  public constructor() {
    super( {
      tandem: Tandem.OPT_OUT
    } );

    // Initialize shell slots (sparse arrays by xPosition).
    for ( let row = 0; row < ALLOWED_PARTICLE_POSITIONS.length; row++ ) {
      for ( let j = 0; j < ALLOWED_PARTICLE_POSITIONS[ row ].length; j++ ) {
        const x = ALLOWED_PARTICLE_POSITIONS[ row ][ j ];

        this.protonShellPositions[ row ][ x ] = {
          xPosition: x,
          type: ParticleTypeEnum.PROTON
        };

        this.neutronShellPositions[ row ][ x ] = {
          xPosition: x,
          type: ParticleTypeEnum.NEUTRON
        };
      }
    }

    // Update reached rows based on nucleon counts.
    this.protonCountProperty.link( count => {
      this.protonsReachedRowIndexProperty.value = getReachedRowIndexForCount( count );
    } );

    this.neutronCountProperty.link( count => {
      this.neutronsReachedRowIndexProperty.value = getReachedRowIndexForCount( count );
    } );

    // Reposition when reached-row changes.
    this.protonsReachedRowIndexProperty.link( () => {
      this.updateNucleonPositions(
        this.protons,
        this.protonShellPositions,
        this.protonsReachedRowIndexProperty.value,
        0
      );
    } );

    this.neutronsReachedRowIndexProperty.link( () => {
      this.updateNucleonPositions(
        this.neutrons,
        this.neutronShellPositions,
        this.neutronsReachedRowIndexProperty.value,
        BANConstants.X_DISTANCE_BETWEEN_ENERGY_LEVELS
      );
    } );
  }

  private getNucleonShellPositions( particleType: ParticleTypeEnum | ParticleType ): ParticleShellPosition[][] {
    return particleType === ParticleTypeEnum.NEUTRON || particleType === ParticleTypeEnum.NEUTRON.particleTypeString ?
           this.neutronShellPositions :
           this.protonShellPositions;
  }

  /**
   * Return the right-most particle from the highest row that contains particles, if there is one.
   */
  public getLastParticleInShell( particleType: ParticleTypeEnum ): Particle | undefined {
    const nucleonShellPositions = this.getNucleonShellPositions( particleType );

    for ( let row = nucleonShellPositions.length - 1; row >= 0; row-- ) {
      const nucleonShellRow = nucleonShellPositions[ row ];

      for ( let x = nucleonShellRow.length - 1; x >= 0; x-- ) {
        if ( nucleonShellRow[ x ] && nucleonShellRow[ x ].particle !== undefined ) {
          return nucleonShellRow[ x ].particle;
        }
      }
    }
    return undefined;
  }

  /**
   * Reserve the next open slot for an incoming particle and return its destination.
   * This reservation allows the view to count shell occupancy robustly during animations.
   */
  public getParticleDestination( particleType: ParticleTypeEnum, particle: Particle ): Vector2 {
    const nucleonShellPositions = this.getNucleonShellPositions( particleType );
    let rowIndex = 0;

    const openPositionsByRow = nucleonShellPositions.map( row => {
      const defined = row.filter( p => p !== undefined );
      return defined.find( p => p.particle === undefined );
    } );

    const openShellPosition = openPositionsByRow.find( ( pos, i ) => {
      rowIndex = i;
      return pos !== undefined;
    } );

    assert && assert( openShellPosition, 'To add a particle there must be an empty particleShellPosition.' );

    openShellPosition!.particle = particle;

    const viewDestination = this.modelViewTransform.modelToViewXY( openShellPosition!.xPosition, rowIndex );
    viewDestination.addXY(
      particleType === ParticleTypeEnum.NEUTRON ? BANConstants.X_DISTANCE_BETWEEN_ENERGY_LEVELS : 0,
      0
    );

    return viewDestination;
  }

  /**
   * Update all proton and neutron positions in their energy levels.
   */
  public override reconfigureNucleus(): void {
    this.updateNucleonPositions(
      this.protons,
      this.protonShellPositions,
      this.protonsReachedRowIndexProperty.value,
      0
    );

    this.updateNucleonPositions(
      this.neutrons,
      this.neutronShellPositions,
      this.neutronsReachedRowIndexProperty.value,
      BANConstants.X_DISTANCE_BETWEEN_ENERGY_LEVELS
    );
  }

  /**
   * Remove the particle's placement in the shell and from the ParticleAtom.
   */
  public override removeParticle( particle: Particle ): void {
    this.removeParticleFromShell( particle );
    super.removeParticle( particle );
  }

  /**
   * Remove the given particle from its shell position.
   */
  public removeParticleFromShell( particle: Particle ): void {
    const nucleonShellPositions = this.getNucleonShellPositions( particle.type );

    nucleonShellPositions.forEach( row => {
      row.forEach( pos => {
        if ( pos && pos.particle === particle ) {
          pos.particle = undefined;
        }
      } );
    } );
  }

  /**
   * Remove all nucleons from their shell positions and from the particleAtom without reconfiguring the nucleus.
   */
  public override clear(): void {
    this.protonsReachedRowIndexProperty.reset();
    this.neutronsReachedRowIndexProperty.reset();

    this.clearAllShellPositionParticles( this.protonShellPositions );
    this.clearAllShellPositionParticles( this.neutronShellPositions );
    super.clear();
  }

  private clearAllShellPositionParticles( nucleonShellPositions: ParticleShellPosition[][] ): void {
    nucleonShellPositions.forEach( row => {
      row.forEach( pos => {
        if ( pos && pos.particle ) {
          pos.particle = undefined;
        }
      } );
    } );
  }

  /**
   * Place particles into shell slots and apply optional binding to completed lower rows.
   */
  private updateNucleonPositions(
    particleArray: ObservableArray<BANParticle>,
    particleShellPositions: ParticleShellPosition[][],
    reachedRowIndex: number,
    xOffset: number
  ): void {

    // BINDING EFFECT toggle (keep true if you want the squeeze/center effect)
    const bindingEnabled = true;

    const incomingParticles: Particle[] = [];

    // Clear all slots, but remember reserved incoming particles.
    particleShellPositions.forEach( row => {
      row.forEach( pos => {
        if ( pos && pos.particle && !particleArray.includes( pos.particle ) ) {
          incomingParticles.push( pos.particle );
        }
        if ( pos ) {
          pos.particle = undefined;
        }
      } );
    } );

    // Reference width for squeeze scale: use widest row.
    const widestRowIndex = ENERGY_LEVELS.reduce(
      ( bestIdx, level, idx ) => level.capacity > ENERGY_LEVELS[ bestIdx ].capacity ? idx : bestIdx,
      0
    );

    const widestRowPositions = ALLOWED_PARTICLE_POSITIONS[ widestRowIndex ];
    const rowWidth =
      this.modelViewTransform.modelToViewX( widestRowPositions[ widestRowPositions.length - 1 ] ) -
      this.modelViewTransform.modelToViewX( widestRowPositions[ 0 ] );

    // Place counted particles.
    particleArray.forEach( ( particle, index ) => {

      const rowIndex = getRowIndexForGlobalIndex( index );
      const xIndex = this.getLocalXIndex( index, rowIndex );

      const shellPos = particleShellPositions[ rowIndex ][ xIndex ];
      shellPos.particle = particle;

      let viewDestination: Vector2;
      let inputEnabled: boolean;

      // Bind rows strictly below reachedRowIndex.
      // if ( bindingEnabled && rowIndex < reachedRowIndex ) {

      //   const indexWithinRow = index - getCapacityBelowRow( rowIndex );
      //   const rowCapacity = ENERGY_LEVELS[ rowIndex ].capacity;

      //   // Stable squeeze scaling for any capacity.
      //   const denom = Math.max( 1, ( 3 * rowCapacity - 1 ) );
      //   const boundOffset = rowWidth * ( indexWithinRow / denom );

      //   // Keep squeezed cluster centered.
      //   const numberOfRadiusSpaces = rowCapacity - 1;
      //   const centerOffset = PARTICLE_RADIUS * numberOfRadiusSpaces / 2;

      //   const unBoundX = this.modelViewTransform.modelToViewX( shellPos.xPosition ) + xOffset;
      //   const destinationX = unBoundX - boundOffset + centerOffset;

      //   viewDestination = new Vector2( destinationX, this.modelViewTransform.modelToViewY( rowIndex ) );
      //   inputEnabled = false;
      // }
      // else 
      {
        viewDestination = this.modelViewTransform.modelToViewXY( shellPos.xPosition, rowIndex );
        viewDestination.addXY( xOffset+60, 0 );
        inputEnabled = true;
      }

      BANParticle.setAnimationDestination( particle, viewDestination );
      particle.inputEnabledProperty.value = inputEnabled;
    } );

    // Check duplicates (excluding incoming reservations).
    if ( assert ) {
      const placed = particleShellPositions.flat()
        .map( p => p && p.particle )
        .filter( p => p && !incomingParticles.includes( p ) );

      assert && assert(
        _.uniq( placed ).length === placed.length,
        'There are duplicate particles in particleShellPositions.',
        particleShellPositions
      );
    }

    // Restore reservations (they keep their reserved shell slot).
    incomingParticles.forEach( particle => {
      particle.destinationProperty.value = this.getParticleDestination(
        ParticleTypeEnum.getParticleTypeFromStringType( particle.type ),
        particle
      );
    } );
  }

  /**
   * Get local x index (within row) for placement based on global index.
   */
  private getLocalXIndex( globalIndex: number, rowIndex: number ): number {
    let indexForRow = globalIndex;
    let r = rowIndex - 1;

    while ( r >= 0 ) {
      indexForRow -= ALLOWED_PARTICLE_POSITIONS[ r ].length;
      r -= 1;
    }

    return ALLOWED_PARTICLE_POSITIONS[ rowIndex ][ indexForRow ];
  }
}

buildANucleus.register( 'ShellModelNucleus', ShellModelNucleus );
export default ShellModelNucleus;
