"""Art direction for the existing thirty residents; no runtime casting changes.

Heritage is authored context, not inferred from skin colour or a facial measurement.
MakeHuman's three historical macro-target names are only morph controls. Mixed
values and individual proportions deliberately avoid a one-template-per-community
cast. The original PEOPLE definitions remain available through --procedural.
"""

# id: (heritage, skin sRGB, hair sRGB, hair style, source morph mixture, age)
# Source mixture order: African / Asian / Caucasian. These are source filenames,
# not claims that the source has an Andean-specific model (it does not).
LOOKS = {
    'm_tendero': ('mestizo', '#aa7857', '#29201c', 'sidepart', (.15, .30, .55), 45),
    'm_obrero': ('Andean', '#ae7850', '#211b19', 'short', (.10, .40, .50), 34),
    'w_tendera': ('Andean', '#a87550', '#27201e', 'braid', (.12, .38, .50), 48),
    'w_ama': ('mestizo', '#bd8c69', '#473229', 'pony', (.15, .24, .61), 37),
    'w_elder': ('Afro-Colombian', '#80583f', '#a6a19a', 'bun', (.73, .10, .17), 74),
    'm_elder': ('European-descent', '#c89d82', '#aaa59c', 'receding', (.10, .14, .76), 76),
    'b_boy': ('mestizo', '#bd8b67', '#251e1b', 'short', (.20, .28, .52), 10),
    'g_girl': ('Andean', '#b98965', '#28201d', 'pigtails', (.12, .42, .46), 8),
    't_boy': ('Afro-Colombian', '#895c43', '#211d1c', 'curly', (.72, .08, .20), 16),
    't_girl': ('mestizo', '#b78160', '#493227', 'long', (.18, .26, .56), 17),
    'm_afro': ('Afro-Colombian', '#694735', '#241f1d', 'curly', (.82, .06, .12), 39),
    'w_afro': ('Afro-Colombian', '#80563e', '#2d2420', 'curly', (.78, .08, .14), 36),
    'm_panadero': ('mestizo', '#b48362', '#3b2b24', 'short', (.18, .28, .54), 51),
    'w_cocinera': ('Andean', '#a77550', '#342722', 'braid', (.14, .36, .50), 53),
    'm_carnicero': ('European-descent', '#c5997b', '#574238', 'short', (.10, .12, .78), 47),
    'w_peluquera': ('European-descent', '#d0a48a', '#754736', 'bob', (.10, .12, .78), 32),
    'm_mecanico': ('mestizo', '#ad7d5c', '#332722', 'short', (.20, .25, .55), 42),
    'w_farmaceutica': ('mestizo', '#c39675', '#4b362d', 'bun', (.15, .24, .61), 41),
    'w_maestra': ('European-descent', '#cc9f82', '#71513a', 'bob', (.10, .15, .75), 44),
    'm_mototaxi': ('mestizo', '#ae7858', '#2c2420', 'buzz', (.28, .22, .50), 29),
    'm_vendedor': ('Andean', '#b1805b', '#44342a', 'short', (.14, .35, .51), 57),
    'm_abuelo': ('Andean', '#a77855', '#aaa59d', 'receding', (.12, .38, .50), 79),
    'w_beata': ('mestizo', '#b68565', '#c1bcb4', 'bald', (.20, .26, .54), 77),
    'b_escolar': ('European-descent', '#c99c7c', '#614632', 'sidepart', (.10, .15, .75), 11),
    'g_escolar': ('Afro-Colombian', '#986b4f', '#30251f', 'pigtails', (.65, .10, .25), 9),
    'm_joven': ('mestizo', '#a97654', '#30251e', 'slick', (.26, .24, .50), 25),
    'w_vecina': ('mestizo', '#b17e5e', '#584033', 'sidepart', (.24, .28, .48), 56),
    'm_don': ('European-descent', '#c59777', '#898279', 'receding', (.12, .13, .75), 63),
    'w_joven': ('Afro-Colombian', '#946346', '#30251f', 'topknot', (.67, .10, .23), 24),
    'm_rapado': ('Afro-Colombian', '#82553c', '#25201c', 'buzz', (.73, .10, .17), 17),
}


def customize_cast(people):
    """Apply distinct, deterministic art settings without changing any IDs/tags/rigs."""
    for i, p in enumerate(people):
        heritage, skin, hair, style, mix, age = LOOKS[p['id']]
        p.update(heritage=heritage, skin_hex=skin, hair_hex=hair,
                 hair=(p['hair'][0], style), head_mix=mix, age=age,
                 face_width=(.96, 1.03, 1.00, 1.05, .98)[i % 5],
                 jaw_width=(1.04, .94, 1.06, .98, 1.00, .96)[i % 6],
                 nose_width=(.97, 1.04, 1.07, .96, 1.00)[i % 5],
                 nose_depth=(1.04, .98, 1.06, 1.00, .95, 1.02)[i % 6],
                 eye_spacing=(1.02, .98, 1.00, 1.03)[i % 4])
        # Distinct practical wardrobe; national/club logos are deliberately absent.
        if p['id'] == 'm_obrero':
            p.update(overalls='#536878', bot='#536878', top='#bf9474', top_style='tshirt')
        elif p['id'] == 'm_mecanico':
            p.update(overalls='#596c7a', bot='#596c7a', top='#b5afa1', top_style='shirt', workwear=True)
        elif p['id'] in ('w_tendera', 'w_cocinera', 'm_vendedor'):
            p['shoe'] = ('sandal', '#674835', '#392d23')
        elif p['id'] == 'm_elder':
            p.update(top='#6e737d', inner='#d9c9af', church=True)
        elif p['id'] == 'w_beata':
            p.update(top='#69616e', inner='#d8d0bf', church=True)
        if p['top_style'] == 'football':
            p['shirt_trim'] = '#d8c695' if p['id'] == 'm_afro' else '#e4dfd2'
        if 'student' in p.get('tags', []):
            p['school_trim'] = '#263d64'
        if age >= 60:
            p['wrinkles'] = True
    return people
