interface ViewportRenderer {
  domElement: { width: number; height: number };
  getPixelRatio(): number;
  setSize(width: number, height: number, updateStyle: boolean): void;
}
interface ViewportCamera { aspect: number; updateProjectionMatrix(): void }

/** Share the resize path between window events and the start of each rendered frame. */
export function resizeViewport(renderer: ViewportRenderer, camera: ViewportCamera, width: number, height: number): boolean {
  if (width <= 0 || height <= 0) return false;
  const ratio = renderer.getPixelRatio();
  const resized = renderer.domElement.width !== Math.floor(width * ratio) || renderer.domElement.height !== Math.floor(height * ratio);
  // WebGLRenderer.setSize assigns canvas.width/height even if they are unchanged,
  // clearing the drawing buffer. A late resize event must preserve the last frame.
  if (resized) renderer.setSize(width, height, false);
  if (camera.aspect !== width / height) {
    camera.aspect = width / height; camera.updateProjectionMatrix();
  }
  return resized;
}
