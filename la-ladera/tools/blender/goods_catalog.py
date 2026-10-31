"""Authoring data for La Ladera's shelf goods. Metres, +Y up, +Z front.

The generator emits the planner catalogue and manifest from these records; do
not hand-edit either generated file. All brands below are fictional artwork.
"""
from collections import OrderedDict

ATLAS_SIZE = 1024
TILE_SIZE = 256
ATLAS_FILE = 'goods_labels.png'
SURFACE = 'goods_surface'
LABEL = 'goods_label'

# id, invented brand, product text, background, ink, accent
LABELS = [
    ('conservas', 'VALDELUMBRE', 'CONSERVAS', '#eddfb3', '#254c3d', '#d85835'),
    ('granos', 'GRANOVIENTO', 'GRANOS SELECTOS', '#e5cf9d', '#64442f', '#418061'),
    ('leche', 'NUBELAR', 'LECHE', '#f2efe4', '#1b577e', '#71afce'),
    ('jugo', 'HUERTAZUL', 'JUGO DE FRUTA', '#f0b945', '#36563c', '#ed7432'),
    ('aceite', 'OLIVISCUMBRE', 'ACEITE', '#e7d277', '#3a5c3a', '#779145'),
    ('gaseosa', 'BRISACUMBRE', 'GASEOSA', '#d86b43', '#fff2d5', '#f8ca69'),
    ('cafe', 'MONTELOMA', 'CAFÉ MOLIDO', '#e4caa6', '#49392e', '#a74f3e'),
    ('azucar', 'DULCEVIENTO', 'AZÚCAR', '#ede3c5', '#2d667a', '#6aa69c'),
    ('harina', 'PANBRISA', 'HARINA', '#e8d6b5', '#7b4631', '#d29242'),
    ('chips', 'CRUJICUMBRE', 'PAPAS CRUJIENTES', '#e3b13c', '#943f30', '#f3e2a3'),
    ('botica', 'CLARALOMA', 'CUIDADO DIARIO', '#ebece0', '#31796c', '#8fb9aa'),
    ('vendas', 'COTOLUNA', 'VENDAS', '#e4edf0', '#445875', '#77a6bd'),
    ('pintura', 'COLORALBA', 'PINTURA', '#e9ddd1', '#53576b', '#bd604e'),
    ('papel', 'CUADERNUBE', 'CUADERNO', '#dbe5ce', '#395a4c', '#8eb371'),
    ('periodico', 'LA VOZ DEL PELDAÑO', 'EL BARRIO FLORECE', '#dcd4bd', '#49473d', '#817965'),
    ('juguetes', 'BRINCALOMA', 'JUGUETES', '#e7c68b', '#3b646b', '#c65c4b'),
]

CATALOG = OrderedDict()


def add(name, category, size, label=None):
    key = 'goods_' + name
    rec = {'size': list(size), 'footprint': [size[0], size[2]],
           'category': category, 'tags': ['goods', category]}
    if label:
        rec['labelId'] = label
    CATALOG[key] = rec


add('apple', 'fruit', (.095, .115, .095))
add('orange', 'fruit', (.10, .10, .10))
add('banana_bunch', 'fruit', (.21, .14, .18))
add('pear', 'fruit', (.09, .15, .09))
add('grapes', 'fruit', (.13, .18, .13))
add('watermelon_slice', 'fruit', (.25, .135, .09))
add('tomato', 'vegetable', (.105, .10, .105))
add('carrots', 'vegetable', (.20, .075, .26))
add('pepper', 'vegetable', (.105, .13, .10))
add('aubergine', 'vegetable', (.08, .08, .22))
add('cabbage', 'vegetable', (.18, .15, .18))
add('potato', 'vegetable', (.10, .085, .13))
add('baguette', 'bread', (.10, .09, .40))
add('round_loaf', 'bread', (.23, .13, .23))
add('bread_roll', 'bread', (.14, .08, .11))
add('croissant', 'bread', (.15, .08, .11))
add('cheese_wedge', 'cheese', (.19, .12, .15))
add('cheese_wheel', 'cheese', (.21, .09, .21))
add('preserves_jar', 'jar', (.095, .16, .095), 'conservas')
add('pickles_jar', 'jar', (.10, .18, .10), 'conservas')
add('beans_tin', 'tin', (.095, .13, .095), 'conservas')
add('fish_tin', 'tin', (.13, .045, .08), 'conservas')
add('milk_bottle', 'bottle', (.085, .245, .085), 'leche')
add('juice_bottle', 'bottle', (.085, .25, .085), 'jugo')
add('oil_bottle', 'bottle', (.08, .28, .08), 'aceite')
add('soda_bottle', 'bottle', (.08, .25, .08), 'gaseosa')
add('rice_sack', 'sack', (.22, .29, .15), 'granos')
add('coffee_sack', 'sack', (.23, .30, .16), 'cafe')
add('beans_sack', 'sack', (.22, .28, .15), 'granos')
add('steak', 'meat', (.18, .04, .14))
add('sausages', 'meat', (.18, .05, .15))
add('chicken', 'meat', (.21, .14, .24))
add('flower_bunch', 'flower', (.18, .33, .18))
add('potted_flower', 'flower', (.17, .28, .17))
add('newspaper', 'newspaper', (.25, .065, .33), 'periodico')
add('exercise_book', 'stationery', (.19, .035, .26), 'papel')
add('shoe_pair', 'shoes', (.24, .12, .31))
add('sandal_pair', 'shoes', (.23, .06, .29))
add('toy_car', 'toy', (.14, .075, .08))
add('toy_bear', 'toy', (.14, .19, .10))
add('wooden_blocks', 'toy', (.16, .12, .13), 'juguetes')
add('hammer', 'hardware', (.13, .03, .28))
add('pliers', 'hardware', (.095, .025, .21))
add('paint_tin', 'hardware', (.13, .15, .13), 'pintura')
add('rope_coil', 'hardware', (.16, .035, .16))
add('remedy_box', 'pharmacy', (.095, .16, .045), 'botica')
add('bandage_box', 'pharmacy', (.10, .14, .06), 'vendas')
add('tonic_bottle', 'pharmacy', (.07, .18, .07), 'botica')
add('cup_saucer', 'cafe', (.18, .12, .18))
add('takeaway_cup', 'cafe', (.10, .16, .10), 'cafe')
add('coffee_bag', 'cafe', (.10, .19, .065), 'cafe')
add('sugar_jar', 'cafe', (.10, .15, .10), 'azucar')
add('chips_bag', 'snacks', (.13, .22, .055), 'chips')
add('flour_bag', 'sack', (.12, .18, .08), 'harina')
add('fabric_stack', 'fabric', (.25, .09, .20))
add('thread_spool', 'fabric', (.065, .10, .065))
add('pencil_bundle', 'stationery', (.075, .02, .18))
add('toy_ball', 'toy', (.12, .12, .12))


def atlas_metadata():
    return {'file': ATLAS_FILE, 'width': ATLAS_SIZE, 'height': ATLAS_SIZE,
            'labels': [{'id': r[0], 'brand': r[1], 'product': r[2],
                        'rect': [(i % 4) * TILE_SIZE, (i // 4) * TILE_SIZE, TILE_SIZE, TILE_SIZE]}
                       for i, r in enumerate(LABELS)]}
