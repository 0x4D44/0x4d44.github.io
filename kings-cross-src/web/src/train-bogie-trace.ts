// Bogie frames traced from photographs. The reference photographs are private review assets and are not shipped; what is kept here is the trace: outlines and
// rectangles read off the photograph in ITS OWN PIXELS, beside the two points that calibrate it, so a reader with the photograph can lay the one over the other.
//
// How a photograph becomes metres (`tracer` in train-parts.ts): the two axle-end caps are the centres of the two axles of the bogie, so their distance in pixels is the
// wheelbase (`FIGURES.bogieWheelbase`: published for the AT300, ASSUMED for the Electrostar) and the scale follows; the row of the caps is the axle line, whose height over the rail head is the wheel's radius. Everything
// else is measured from those two numbers, in the plane of the side beam (the photograph is a close-up with strong perspective: the wheels stand further from the lens than the
// beam, so a wheel's size is NOT read from it and stays the figure's). Depths across the bogie cannot be read from a side-on photograph and are ASSUMED (see `AT300_DEPTH` in
// train-parts.ts): the trace is the outline in the side view.
//
// The Desiro City's picture (`SIEMENS_TRACE`) is the exception: it looks down on the bogie from outside the train, so it is calibrated on the two wheels' outer faces (the plane the tyres'
// front edges stand in) and `tracer` is given the camera's elevation, ASSUMED, to take out the height a part gains by standing inboard of that plane. Its depths are ASSUMED too.
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

/**
 * The Bombardier (ex Adtranz) Electrostar bogie, P3-25 under a motor car and T3-25 under a trailer (Class 375, 377, 378 and 387), from `Bogie and traction equipment beneath Door A1 of
 * Class 375 Electrostar .jpg`: unit 375831 at Gillingham (Kent), by OathOn, 2025-06-25, CC0 (Wikimedia Commons), 1920 x 1116 as reviewed. `Adtranz P3-25 bogie 6647161053.jpg` (Hugh
 * Llewelyn, 2012-01-06, CC BY-SA 2.0, 597 x 400) and `British Rail Class 378 bogie and shoegear.jpg` (Chris McKenna, 2014-03-14, CC BY-SA 3.0) show the same bogie from further off and
 * at an angle, and were used to check the shape, not to take numbers.
 *
 * The picture is a close-up taken a little rolled: its two caps stand 31.7 px apart in height, so it is turned 1.2531 degrees (counter-clockwise, about the left cap, bicubic) to put them level,
 * and the numbers below are read off the turned picture. Its scale is the caps' distance over the wheelbase, which no page gives for the Electrostar (`EMU_FIGURES.electrostar.wheelbaseMotor` is ASSUMED, 2.7 m), so every
 * length here is as good as that figure. Unlike the AT300's, the two ends of this bogie are NOT each other's mirror (the right cap is the earth-return housing, larger and with its mark of a
 * lightning bolt; the right end block carries a tongue the left has not; the dampers stand 102 px and 169 px from their caps), so each end is traced for itself and nothing is mirrored. What
 * the picture shows of perspective is small (the heights of the ends' features agree to 6%), and none is corrected. Depths across the bogie are ASSUMED (see `ES_DEPTH` in train-parts.ts).
 * The shoe beam is the 375's third-rail shoe gear carrier: Wikipedia's Class 387 page lists a DC contact shoe for the class (dual voltage), but no page read says whether the Great Northern
 * 387/1s carry it, so that it is drawn on them is ASSUMED. The photograph is of a powered bogie and shows nothing hung between the wheels: what a motor bogie carries there is a GAP, and a
 * trailer bogie is drawn the same.
 */
export const ELECTROSTAR_TRACE = {
  /** The centres of the two axle-end caps, left and right, in the turned picture: the axle line and the wheelbase. */
  caps: [[215, 890], [1664, 890]] as readonly [Px, Px],
  /** The caps' centres as the picture has them, before it is turned, and the turn (atan2 of their rise over their run, in degrees). */
  level: { caps: [[215.5, 890.5], [1664.7, 922.2]] as readonly [Px, Px], degrees: 1.2531 },
  /**
   * The side beam as one outline, clockwise from the left end block's top: over the top (the end blocks stand high and the middle low, between them a swan neck at each end), the right end
   * block with its tongue, its underside, the deep middle's lower edge (a shallow bow) and the shoulder at each end back up to the end block's underside, and the left end block's face.
   */
  beam: [
    [142, 662], [320, 661], [340, 667], [360, 681], [380, 687], [400, 694], [420, 705], [440, 715], [460, 724], [480, 733], [500, 738], [520, 741], [1360, 740], [1380, 739], [1400, 734],
    [1420, 725], [1440, 716], [1460, 704], [1480, 699], [1500, 682], [1520, 670], [1540, 659], [1560, 651], [1580, 649], [1600, 648], [1760, 646], [1790, 655], [1795, 665], [1878, 665],
    [1880, 691], [1808, 692], [1806, 714], [1548, 718], [1548, 722], [1545, 735], [1535, 752], [1520, 772], [1495, 797], [1470, 818], [1440, 835], [1410, 848], [1380, 855], [1340, 858],
    [1300, 860], [1100, 852], [900, 854], [700, 854], [500, 859], [480, 856], [460, 852], [440, 846], [425, 838], [410, 828], [395, 815], [380, 800], [365, 785], [352, 770], [340, 755],
    [320, 740], [300, 730], [285, 724], [140, 724], [117, 727], [118, 710], [122, 690], [128, 673], [135, 665],
  ] as readonly Px[],
  /**
   * What stands at each end. `plate` is the spring seat under the end block, `pack` the dark pack of the primary springs and their guides under it, `damper` the vertical damper beside the
   * end block, `bracket` the cast lug on the axle box's inboard side, `arm` the axle-box arm (an outline, from its eye to the axle box), `housing` and `cap` the radii of the round housing
   * and of the cap standing on it, both on the axle (a calibration point).
   */
  left: {
    plate: [142, 722, 285, 745] as PxRect,
    pack: [160, 745, 300, 828] as PxRect,
    damper: [93, 728, 133, 957] as PxRect,
    bracket: [285, 860, 345, 945] as PxRect,
    arm: [[12, 949], [40, 942], [62, 938], [62, 927], [120, 905], [170, 884], [200, 884], [200, 967], [62, 963], [35, 964], [12, 960]] as readonly Px[],
    housing: 55,
    cap: 36,
  },
  right: {
    plate: [1590, 718, 1730, 742] as PxRect,
    pack: [1572, 742, 1762, 810] as PxRect,
    damper: [1806, 693, 1862, 930] as PxRect,
    bracket: [1520, 850, 1585, 945] as PxRect,
    // (the photograph's arm runs on to x 1912; it is cut at 1900, 1.790 m from the middle, because no part of a bogie may be longer than its wheels reach, 1.798 m)
    arm: [[1700, 880], [1745, 872], [1800, 898], [1850, 922], [1900, 934], [1900, 975], [1790, 968], [1700, 964]] as readonly Px[],
    housing: 75,
    cap: 46,
  },
  /**
   * The air spring over the middle: the rubber bag (a pancake) and, under it, the beam's top (`base`, the row of the lower end of the beam's flat top; the pedestal stands on it). The picture shows the bag's
   * left edge and its shaded right one, and it stands over the middle of the caps.
   */
  air: { bag: [738, 597, 1141, 715] as PxRect, base: 741 },
  /** The bolted shelf hung under the middle of the beam, and the shoe beam along the bottom of the bogie (a long bar between the axle boxes, the third-rail shoe gear's carrier). */
  shelf: [890, 868, 1295, 885] as PxRect,
  shoe: [300, 960, 1560, 1005] as PxRect,
} as const;

/**
 * The Siemens SF7000 bogie of the Desiro City (the Class 700 and 717), from `Class 700 Thameslink at Gatwick station - 28898326470.jpg`: the inside frame of a Class 700's bogie from outside the train
 * at Gatwick, by Elsie esq., 2016-08-23 14:50, CC BY 2.0 (Wikimedia Commons), 5442 x 3626 as published, 1920 x 1279 as reviewed. `... - 28898329080.jpg` (four seconds later) and `... - 29079950332.jpg`
 * (thirty-seven), from further round, show the same kind of bogie under a car numbered 403102, and `... - 29107917221.jpg` the near wheel's hub; they were used to check the shape, not to take numbers.
 * (If the 403xxx cars are the 700's motor cars, an inference from the car number that no page read confirms for this car, the bogie is a powered one; what a trailer bogie carries instead is a GAP, and
 * a trailer bogie is drawn the same.)
 *
 * The picture is turned twice to put the two wheels level (counter-clockwise about the point given, bicubic): first 4.8763 degrees clockwise about the left axle cap (which levelled the caps, but they
 * stand at different depths, so the wheels were still 1.7 degrees out), then 1.7749 degrees about the left wheel's face. The numbers below are read off the turned picture, each to about 8 pixels.
 *
 * It is NOT a side-on view. The camera looks down on the bogie from outside the train and from the left (the left wheel stands nearer and looks bigger), so a part that stands further in from
 * the wheel's face appears higher on the screen than it is. `tracer` (train-parts.ts) takes that out: a part's real height over the axle line is its apparent height less the lift its depth gives
 * it, over the cosine of the camera's elevation. The elevation is ASSUMED, 20 degrees: 15 from how round the wheel's hub plate looks (117 px high, 122 wide) and from how high the body skirt is
 * drawn, 30 to 36 from the tyres' outline (which includes the tread's far edge). The depths across the bogie are ASSUMED too (`SF7000_DEPTH` in train-parts.ts), and the heights follow from them.
 * The scale is the two wheel faces' distance over the wheelbase, 2.2 m (the label on the centre casting reads "2.20m"); the trailer's 2.1 m only moves its wheels, the frame is the traced one.
 *
 * What is traced is what the picture shows between the wheels: the two end castings (the left carries the brake block beside the wheel), the grey casing with its label, the centre casting with the
 * wheelbase's mark, the vertical rod with its clamps, the big vertical damper, the black air spring over the centre, and the long yaw damper with its two eyes running out to the body-mounted Y bracket
 * that stands in front of the right wheel. The two ends are not each other's mirror, so each is traced; the far side is the near one turned half a turn about the vertical (z -> -z), ASSUMED. NOT
 * drawn (GAP): the near wheel's sensor plate, lever and earthing cable, the brake block's stepped outline, the U-shaped pipe under the rod, the pipes and cables over the right casting, and everything
 * the body's skirt hides; each casting is a box.
 */
export const SIEMENS_TRACE = {
  /** The centres of the two wheels' outer faces (the tyre's front edge) in the turned picture: the axle line and the wheelbase. */
  caps: [[491, 733.5], [1685.6, 733.5]] as readonly [Px, Px],
  /** The wheelbase the picture is calibrated to, metres: the label on the centre casting, and the family's motor bogie. */
  wheelbase: 2.2,
  /** The two turns that levelled the picture: degrees, counter-clockwise, about the point. */
  level: { first: { degrees: -4.8763, about: [497, 762] as Px }, second: { degrees: 1.7749, about: [491, 733.5] as Px } },
  /** The camera's elevation over the bogie, degrees: ASSUMED (see above). */
  elevation: 20,
  /** The castings between the wheels: the dark one by the near wheel (its brake block), the grey casing with the label, the centre casting, and the dark one at the far end. */
  casting: {
    left: [681, 515, 832, 784] as PxRect,
    label: [826, 585, 926, 768] as PxRect,
    centre: [958, 619, 1180, 801] as PxRect,
    right: [1234, 529, 1491, 689] as PxRect,
  },
  /** The vertical rod with its clamps (to the left of the centre) and the big vertical damper (to the right of it), each a cylinder: the picture gives its width and the rows of its two ends. */
  rod: [912, 561, 951, 779] as PxRect,
  damper: [1177, 517, 1236, 717] as PxRect,
  /** The black air spring over the centre: the column of its left edge (its radius is that column's distance from the middle); it stands on the centre casting. */
  bag: { edge: 955 },
  /**
   * The yaw damper: the centres of its two ends in the picture (it rises 6.7 degrees toward the right, where the Y bracket hangs higher than the casting), the column at which its thinner cylinder
   * (the left) meets the thicker one, the radius of each in pixels, and the two eyes it ends in (the left one is a bracket on the centre casting, the right one a boss on the Y).
   */
  yaw: { from: [1151, 744] as Px, to: [1534, 699] as Px, step: 1305, rodRadius: 27, bodyRadius: 30, eyeLeft: [1063, 710, 1142, 798] as PxRect, eyeRight: [1540, 674, 1602, 718] as PxRect },
  /** The body-mounted bracket in front of the right wheel: a Y of two arms and a stem, as one outline (clockwise from the left arm's top left); its arms run on up behind the skirt. */
  bracket: [[1539, 531], [1568, 531], [1603, 649], [1662, 536], [1695, 538], [1648, 644], [1630, 733], [1583, 734], [1574, 654]] as readonly Px[],
} as const;
