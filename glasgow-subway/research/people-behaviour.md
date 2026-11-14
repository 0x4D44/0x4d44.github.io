# How people behave on the platform: prior art, and what the game takes from it

The complaint this answers: people paced pre-set loops instead of coming down the stairs and
waiting for a train, waved their arms about, showed nothing on their faces, and turned and
walked off whenever the player came close.

This note records what was looked up, what the game now does because of it, and what is
still not done. Where a figure is quoted from memory rather than from a page read for this
note, it says so.

## 1. Where people wait

| Source | Finding | Used as |
|---|---|---|
| Küpper & Seyfried, *Identification of social groups and waiting pedestrians at railway platforms using trajectory data*, PLOS One 2023 ([arXiv 2303.07783](https://arxiv.org/pdf/2303.07783)) | Waiting people prefer places next to fixed things (walls, stair railings). People with little time before the train stop near the way in; people with a long wait go further along. | `spotCost`: a wall term, and a pull toward the entrance that grows with how soon the train is (`late`) |
| Jülich IAS-7, *Analysis of space usage on train station platforms based on trajectory data* ([summary](https://www.kfa-juelich.de/en/ias/ias-7/research-1/spotlight/analysis-of-space-usage-on-train-station-platforms-based-on-trajectory-data)) | Space is used unevenly, but the distance between individuals varies little. | a fixed preferred spacing (`WAIT.space`, 1.2 m) and a hard minimum (0.55 m) |
| Bosina et al., STRC 2015 ([pdf](https://strc.ch/2015/Bosina_EtAl.pdf)) | Waiting areas form by obstacles and walls first, and by the entrances shortly before the train. | same two terms |
| Johansson, Peterson & Tapani 2015 (waiting pedestrians in the social force model) | The standard social-force model (Helbing & Molnár, [arXiv cond-mat/9805244](https://arxiv.org/abs/cond-mat/9805244)) describes people on the move; people who wait need a model of their own, in which they hold a place. | waiting is its own mode (`stand`): a person picks a place once and stays |

Not from a source, a judgement: regular passengers stand where a door will stop
(`WAIT.door`), and nobody waits within 0.9 m of the platform edge.

## 2. What a waiting person does

Nothing much, which is the point. The old crowd sent 40% of the platform walking between
random points for ever. Now:

- Everyone on the platform when the player arrives is standing at a chosen place, facing
  the track (give or take half a radian).
- The rest of the platform's usual number arrive while the player watches: down the
  stairs (about 0.6 m/s along the flight), across to a place, and stop. The rate tops the
  platform back up between trains.
- When a train is running in, most of the people waiting (70%, up to twelve) walk to the
  doors; it was 30%, up to eight. People who get off cross the platform and go up the
  stairs, keeping to the other side of the flight from people coming down.
- Once in one to four minutes a person moves to another place. Never while the player is
  beside them or a train is due.

Arms: one of the two standing clips swings the right forearm through 109 degrees. Looped
for a whole bout on every other person it was the "waving". It is now played once, about
one idle bout in eight; the quiet stance is the rule. Children's fidget clip went from 45%
of bouts to 20%, also once through.

## 3. What they look at

Reviews of gaze animation for virtual characters (Ruhland et al. 2014, cited by the
others; Andrist, Pejsa, Mutlu & Gleicher 2012, [head-eye coordination model](https://pages.cs.wisc.edu/~bilge/pubs/2012/ICMI12-W-Andrist.pdf);
Peters & Qureshi 2010) agree on the parts: choose a target, share the turn between eyes,
head and trunk, ease in and out, and blink. The game's faces have no movable eyes, so the
whole turn is carried by the head (45%), neck (28%) and upper spine (27%), up to about 65
degrees, eased, at no more than 3.2 rad/s. Past that the body turns.
Someone holding a phone turns the head and neck only (the shoulders stay with the hands),
and someone on a call turns about a third as far (the phone stays at the ear).

Targets when nobody is near: straight ahead most of the time; a glance up the tunnel the
train comes from (more often and for longer as it runs in), at the next-train indicator, or
about. A person on a phone looks up far less.

## 4. When the player comes close

| Source | Finding | Used as |
|---|---|---|
| Hall, *The Hidden Dimension* (1966); distances from memory | intimate < 0.45 m, personal < 1.2 m, social < 3.6 m | `PROX` |
| Goffman, *Behavior in Public Places* (1963); from memory | "civil inattention": strangers give each other one glance and then look away | in the social zone the player gets one glance of 0.8 to 1.8 s, then nothing for 7 s |
| Binetti et al., *Pupil dilation as an index of preferred mutual gaze duration*, R. Soc. Open Sci. 2016; from memory | people are comfortable with about 3.3 s of mutual gaze | inside personal distance a person looks at the player for 2.2 to 4.5 s at a time, with looks away (down and aside) of 0.5 to 1.1 s between |

So: nobody steps aside any more. Inside 1.2 m a person notices after a quarter to half a
second, looks at the player, turns their body if the player is more than about 57 degrees
round, and then either laughs (55% of people: just over a second of quick shoulder shakes
with the eyes dropping) or nods. Only a player who stays within 0.45 m for 0.7 s makes
them give ground, which is what the old code did at 1 m to everyone.

## 5. What is checked, and what is not

Checked by number: unit tests on the spot choice and the attention model
(`js/sim/sim.test.mjs`), and an end-to-end audit at Hillhead (`waitAudit` in
`tools/test_sim.mjs`): standing people do not drift, nobody paces, a newcomer starts 3.26 m
up the stairs and ends standing on the platform, and a person approached to 0.95 m does not
move, looks, turns and greets.

Not done, and not claimed:

- **No smile.** The faces are painted textures with no jaw, lip or brow controls. The laugh
  is in the shoulders and head only. A real smile needs the face rebuilt with morph targets.
- **Stairs are walked as a slope.** Feet do not land on the treads.
- **No groups.** Everyone arrives and waits alone; real platforms have pairs who face each
  other and talk.
- **Train riders do not look at the player.** Only the platform crowd has attention.
- Motion-matching and learned controllers (the state of the art for full-body motion in
  games) were not attempted: the game has 21 short clips, no motion database.
- Nobody has watched this move. The checks are positions, angles and stills.
