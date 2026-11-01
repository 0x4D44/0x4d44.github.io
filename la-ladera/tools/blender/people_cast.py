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


# Original practical wardrobes, generated with the geometry/texture builder and
# released as CC0-1.0. No club crests, brand marks or copied textile prints.
# The garment silhouette and each resident's trade remain the established cast.
# top_secondary is a contrasting cloth colour for cuffs/yokes; top_print requests
# an original small motif on the garment surface. Patterns live in the two spare
# atlas cells, so their per-person tints still use the existing recolour slots.
WARDROBES = {
    'm_tendero': dict(top='#d8c7a5', bot='#3e4b56', top_fabric='check_cotton', top_tucked=True, cloth_wear=.16),
    'm_obrero': dict(top='#ba8a61', bot='#536878', overalls='#536878', top_fabric='jersey', cloth_wear=.65),
    'w_tendera': dict(top='#6b907c', bot='#364d51', top_fabric='knit', top_secondary='#526c5d', cloth_wear=.22),
    'w_ama': dict(top='#ba7480', bot='#363c49', top_fabric='stripe_cotton', cloth_wear=.18),
    'w_elder': dict(top='#786b83', inner='#d8cbbd', bot='#38363d', top_fabric='wool_coat', cloth_wear=.28),
    'm_elder': dict(top='#707a80', inner='#d6c9b5', bot='#4c5155', top_fabric='suit', cloth_wear=.30),
    'b_boy': dict(top='#d9b85b', bot='#394c69', top_fabric='jersey', shirt_trim='#eee2bd', cloth_wear=.18),
    'g_girl': dict(top='#588b96', bot='#588b96', top_fabric='cotton', top_secondary='#d9d1ae', top_print='flower', cloth_wear=.12),
    't_boy': dict(top='#36516b', bot='#3c475c', top_fabric='jersey', top_secondary='#98635c', cloth_wear=.24),
    't_girl': dict(top='#bb7d86', bot='#414650', top_fabric='jersey', top_secondary='#dfc9b2', cloth_wear=.15),
    'm_afro': dict(top='#c99b50', bot='#3e4c60', top_fabric='jersey', shirt_trim='#e7d6b3', cloth_wear=.26),
    'w_afro': dict(top='#b56f55', bot='#b56f55', top_fabric='cotton', top_secondary='#e1c39b', top_print='leaf', cloth_wear=.16),
    'm_panadero': dict(top='#688797', bot='#b9b1a0', apron='#e5dfce', top_fabric='cotton', top_tucked=True, cloth_wear=.35),
    'w_cocinera': dict(top='#ba7c65', bot='#526477', apron='#dfd4b9', top_fabric='check_cotton', cloth_wear=.38),
    'm_carnicero': dict(top='#deddd4', bot='#68717a', apron='#bdc6cb', top_fabric='cotton', top_tucked=True, cloth_wear=.28),
    'w_peluquera': dict(top='#ac9caf', bot='#61758d', top_fabric='stripe_cotton', cloth_wear=.18),
    'm_mecanico': dict(top='#b8ae96', bot='#596c7a', overalls='#596c7a', top_fabric='cotton', top_tucked=True, cloth_wear=.72),
    'w_farmaceutica': dict(top='#e5e4dc', inner='#6f9b98', bot='#7d8c98', top_fabric='cotton', cloth_wear=.07),
    'w_maestra': dict(top='#9a829f', bot='#62656c', top_fabric='knit', top_secondary='#77667d', cloth_wear=.18),
    'm_mototaxi': dict(top='#8b8d87', bot='#5c7292', vest='#df8e36', top_fabric='jersey', cloth_wear=.42),
    'm_vendedor': dict(top='#bac6b2', bot='#8c7960', top_fabric='check_cotton', top_tucked=True, cloth_wear=.32),
    'm_abuelo': dict(top='#c9c0a9', bot='#666b6f', ruana='#8b684a', ruana_trim='#c4a878', top_fabric='stripe_cotton', top_tucked=True, cloth_wear=.32),
    'w_beata': dict(top='#716875', inner='#d5ccbb', bot='#34343a', top_fabric='wool_coat', cloth_wear=.28),
    'b_escolar': dict(top='#e4e4da', bot='#647b9b', top_fabric='cotton', top_tucked=True, cloth_wear=.08),
    'g_escolar': dict(top='#e5e4d8', bot='#647b9b', top_fabric='cotton', top_tucked=True, cloth_wear=.08),
    'm_joven': dict(top='#4b826d', bot='#43546c', top_fabric='jersey', shirt_trim='#dbd9c1', cloth_wear=.20),
    'w_vecina': dict(top='#92936b', bot='#4f6379', top_fabric='knit', top_secondary='#697454', cloth_wear=.30),
    'm_don': dict(top='#9bafb9', bot='#585962', top_fabric='stripe_cotton', top_tucked=True, cloth_wear=.20),
    'w_joven': dict(top='#d1ae64', bot='#4f6c8a', top_fabric='jersey', top_secondary='#557e77', top_print='leaf', cloth_wear=.17),
    'm_rapado': dict(top='#ae6355', bot='#353a43', top_fabric='jersey', shirt_trim='#d9d2b8', cloth_wear=.23),
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
        p.update(WARDROBES[p['id']])
        if p['top_style'] == 'football':
            p.setdefault('shirt_trim', '#d8c695' if p['id'] == 'm_afro' else '#e4dfd2')
        if 'student' in p.get('tags', []):
            p['school_trim'] = '#263d64'
        if age >= 60:
            p['wrinkles'] = True
    return people
