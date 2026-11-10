// Bogie frames traced from photographs. The reference photographs are private review assets and are not shipped; what is kept here is the trace: outlines and
// rectangles read off the photograph in ITS OWN PIXELS, beside the two points that calibrate it, so a reader with the photograph can lay the one over the other.
//
// How a photograph becomes metres (`tracer` in train-parts.ts): the two axle-end caps are the centres of the two axles of the bogie, so their distance in pixels is the
// published wheelbase (`FIGURES.bogieWheelbase`) and the scale follows; the row of the caps is the axle line, whose height over the rail head is the wheel's radius. Everything
// else is measured from those two numbers, in the plane of the side beam (the photograph is a close-up with strong perspective: the wheels stand further from the lens than the
// beam, so a wheel's size is NOT read from it and stays the figure's). Depths across the bogie cannot be read from a side-on photograph and are ASSUMED (see `AT300_DEPTH` in
// train-parts.ts): the trace is the outline in the side view.
//
// The photograph's right is the bogie's -z on the +x side (seen from outside the train). The two ends of the bogie are each other's mirror about the middle of the caps
// to within 3 pixels at the tops of the end blocks and 5 at the arches, so an end is traced once (the photograph's left, +z) and mirrored; the features of the middle (the
// bracket, the damper, the anti-roll rod and lever, the step) are one-sided, and the bogie's other side beam carries them turned half a turn about the vertical (z -> -z).

/** A point in a photograph's pixels: x to the right, y down. */
export type Px = readonly [number, number];
/** A rectangle in a photograph's pixels: x0, y0, x1, y1. */
export type PxRect = readonly [number, number, number, number];
/** A circle in a photograph's pixels: the centre and the radius. */
export interface PxCircle {
  readonly c: Px;
  readonly r: number;
}

/**
 * The Hitachi AT300 bogie, from `GWR 802003 835003 leading bogie revised fittings.jpg`: the leading bogie of car 835003 of GWR's 802003 (outer side; hardware only: the paint of
 * the bogie is mud and brake dust and is not taken), by Geof Sheppard, 2023-07-27, CC BY-SA 4.0 (Wikimedia Commons), 1920 x 1279 as reviewed. A leading bogie of a driving
 * car, which the AT300 builds as a trailer (`AT300_TRAILER_CARS`); `GWR 802018 831018 bogie and door detail.jpg` (CC BY-SA 4.0, 1366 x 1024) shows the same frame with the car's
 * door above it and was used to check the shape, not to take numbers.
 */
export const AT300_TRACE = {
  /** The centres of the two axle-end caps (the round caps with the maker's mark): the axle line and the wheelbase. */
  caps: [[347, 860], [1594, 856]] as readonly [Px, Px],
  /**
   * The side beam as one outline, traced round the photograph's left end (+z) and mirrored for the right: the end block's top edge and the swan neck over it, the end
   * block's outer edge, the roof of the slot over each wheel ("the arch") and its floor (the top of the axle-box arm), the arm's lower edge and the deep middle's. The slot is
   * open towards its end, where the damper, the lug and the spring stand in front of it. Its far (right) side is the mirror of the left.
   */
  beam: {
    /** The top edge from the end block's outer corner to the middle; the middle is level from the last point to its mirror. */
    top: [[175, 647], [200, 640], [230, 631], [262, 626], [282, 616], [300, 610], [330, 607], [360, 606], [410, 607], [440, 611], [470, 615], [520, 617], [560, 624], [600, 632], [630, 642], [660, 656], [700, 674], [740, 692], [770, 700], [800, 708], [850, 716]] as readonly Px[],
    /** The end block's outer edge, down from the top corner to its foot (the foot runs level to the slot's mouth). */
    end: [[176, 695], [183, 709]] as readonly Px[],
    /** The roof of the slot, from its mouth under the end block to the arch's foot. */
    slotRoof: [[262, 709], [376, 711], [440, 710], [476, 706], [500, 706], [516, 708], [524, 711], [540, 718], [556, 727], [564, 736], [572, 748], [578, 765]] as readonly Px[],
    /** The row of the slot's floor (the top of the axle-box arm), and the column of the arch's foot where the floor meets the middle block. */
    slotFloor: 798,
    archFoot: 580,
    /** The lower edge, from the arm's end under the axle box (its column is the slot's mouth) to the middle; the middle is level from the last point to its mirror. */
    bottom: [[262, 905], [400, 900], [500, 872], [560, 863], [580, 878], [640, 882], [668, 852], [800, 862], [840, 866]] as readonly Px[],
  },
  /** What stands at each end of the bogie, at the left (+z) end; the right end is its mirror. */
  end: {
    /** The axle box, and the radius of the round cap on its end (the cap stands on the axle, at a calibration point). */
    box: [298, 797, 394, 905] as PxRect,
    capRadius: 36,
    /** The black sensor housing on the box's inboard side. */
    sensor: [386, 808, 468, 898] as PxRect,
    /** The spring stack over the box: its width, its top (under the end block's foot) and its foot (on the box). */
    spring: [285, 710, 435, 797] as PxRect,
    /** The vertical damper between the end block's foot and the axle box. */
    damper: [222, 709, 262, 852] as PxRect,
    /** The lug on the end block's outer face, and the pedestal strap with its window over the spring. */
    lug: [172, 688, 215, 790] as PxRect,
    pedestal: [307, 668, 385, 797] as PxRect,
    pedestalWindow: [325, 689, 372, 735] as PxRect,
  },
  /** The round boss on the deep middle of the beam, at the left (+z); its mirror stands at the right. */
  boss: { c: [793, 797], r: 53 } as PxCircle,
  /**
   * The car's dark cast bracket that hangs the yaw damper (outline, clockwise from the top left; its top hides under the body's skirt), the damper and its two clevises
   * (the body is the cylinder, along z), and the anti-roll rod with its two clamps, its collar and its ball joint, the lever it turns and the boss on the lever's end.
   */
  bracket: [[725, 600], [908, 600], [908, 622], [882, 628], [884, 660], [893, 698], [906, 738], [919, 776], [922, 800], [922, 852], [886, 852], [874, 790], [862, 760], [842, 738], [820, 716], [780, 676], [742, 632], [725, 630]] as readonly Px[],
  yaw: { body: [944, 795, 1238, 845] as PxRect, clevisNear: [901, 801, 944, 833] as PxRect, clevisFar: [1242, 801, 1300, 852] as PxRect },
  rod: { x: 709.5, radius: 10, top: 604, bottom: 848, clamps: [[692, 654, 722, 686], [692, 788, 722, 820]] as readonly PxRect[], collar: [696, 730, 724, 742] as PxRect },
  ball: { c: [711, 868], r: 20 } as PxCircle,
  lever: [[692, 888], [730, 880], [782, 888], [798, 906], [786, 935], [730, 922], [698, 916]] as readonly Px[],
  leverBoss: { c: [798, 915], r: 25 } as PxCircle,
  /** The maintenance step under the middle of the bogie: its length along z, the top of its rear wall (the beam's lower edge), the top of its wings and the tread's two rows. */
  step: { z: [1013, 1207] as readonly [number, number], wallTop: 866, wingTop: 897, treadTop: 912, treadBottom: 937 },
  /** The air spring over the middle: the row of the rubber bag's lower rim, which stands on a pedestal between it and the beam's top. */
  air: { base: 688 },
} as const;
