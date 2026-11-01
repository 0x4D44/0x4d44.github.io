// Shared material DATA. CharacterLibrary keeps its glTF material for
// its skinned characters; other library users can resolve the same name/atlas.
// Fields: see core/matlib.js.
export default {
  people_pbr: {
    color: 0xffffff, rough: 1, metal: 0, uv: 'unit', tex: 'people_pbr',
    side: 'double', vertexColors: true, env: 0.7,
    desc: 'Shared resident skin, cloth and hair atlas. Authored by tools/blender/people_build.py.',
  },
};
