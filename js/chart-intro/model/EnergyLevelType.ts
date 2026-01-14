// Copyright 2023-2024, University of Colorado Boulder

/**
 * EnergyLevelType identifies constant conditions for the energy levels.
 *
 * Models energy levels for a Nucleon Shell Model, see https://en.wikipedia.org/wiki/Nuclear_shell_model.
 * We only model the first 3 energy levels, signifying n=0, n=1, and n=2.
 *
 * @author Luisa Vargas
 */

import Enumeration from '../../../../phet-core/js/Enumeration.js';
import EnumerationValue from '../../../../phet-core/js/EnumerationValue.js';
import buildANucleus from '../../buildANucleus.js';



// EnergyLevelType.ts

class EnergyLevelType extends EnumerationValue {

  // n, l, j encoded for labeling/physics (optional but useful)
  public constructor(
    public readonly n: number,
    public readonly l: number,
    public readonly j2: number,          // store 2j as int to avoid floats (e.g., j=3/2 => j2=3)
    public readonly yPosition: number,   // vertical row in the diagram
    public readonly label: string        // e.g., '1p3/2'
  ) {
    super();
  }

  public get capacity(): number {
    // 2j+1 where j = j2/2  =>  (j2 + 2)/2, but integer arithmetic is easier as:
    return this.j2 + 1; // because j2 = 2j
  }

  // Example ordering: up to pf (edit as you like)
  public static readonly _1s1_2 = new EnergyLevelType( 1, 0, 1, 0, '1s_{1/2}' ); // cap 2
  public static readonly _1p3_2 = new EnergyLevelType( 1, 1, 3, 1, '1p_{3/2}' ); // cap 4
  public static readonly _1p1_2 = new EnergyLevelType( 1, 1, 1, 2, '1p_{1/2}' ); // cap 2
  public static readonly _1d5_2 = new EnergyLevelType( 1, 2, 5, 3, '1d_{5/2}' ); // cap 6
  public static readonly _2s1_2 = new EnergyLevelType( 2, 0, 1, 4, '2s_{1/2}' ); // cap 2
  public static readonly _1d3_2 = new EnergyLevelType( 1, 2, 3, 5, '1d_{3/2}' ); // cap 4
  public static readonly _1f7_2 = new EnergyLevelType( 1, 3, 7, 6, '1f_{7/2}' ); // cap 8
  public static readonly _2p3_2 = new EnergyLevelType( 2, 1, 3, 7, '2p_{3/2}' ); // cap 4
  public static readonly _1f5_2 = new EnergyLevelType( 1, 3, 5, 8, '1f_{5/2}' ); // cap 6
  public static readonly _2p1_2 = new EnergyLevelType( 2, 1, 1, 9, '2p_{1/2}' ); // cap 2
  // add more if you want (g9/2, etc.)

  public static readonly enumeration = new Enumeration( EnergyLevelType );

  public static readonly ENERGY_LEVELS = [
    EnergyLevelType._1s1_2,
    EnergyLevelType._1p3_2,
    EnergyLevelType._1p1_2,
    EnergyLevelType._1d5_2,
    EnergyLevelType._2s1_2,
    EnergyLevelType._1d3_2,
    EnergyLevelType._1f7_2,
    EnergyLevelType._2p3_2,
    EnergyLevelType._1f5_2,
    EnergyLevelType._2p1_2
  ] as const;

  public static getForIndex( index0Based: number ): EnergyLevelType {
    let r = index0Based;
    for ( const level of EnergyLevelType.ENERGY_LEVELS ) {
      r -= level.capacity;

      if ( r < 0 ) {
        return level;
      }
    }
    assert && assert( false, `index out of supported range: ${index0Based}` );
    return EnergyLevelType.ENERGY_LEVELS[ EnergyLevelType.ENERGY_LEVELS.length - 1 ];
  }
}


buildANucleus.register( 'EnergyLevelType', EnergyLevelType );
export default EnergyLevelType;