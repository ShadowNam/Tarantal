// D-057 (tree life): where a light's haze band goes in a plane layer. Mist lying on the veld (a
// band with a top or bottom edge) goes under the layer's props, so a tall prop such as the baobab
// never shows a hard light band across its trunk where the mist starts. A haze over the whole
// layer (distance haze) has no edge and stays over the props, which are as far away as the art.

/** True when this band is drawn under a plane layer's props (sky and backdrops keep their order). */
export function hazeBelowProps(h: { readonly top?: number; readonly bottom?: number }): boolean {
  return h.top !== undefined || h.bottom !== undefined;
}
