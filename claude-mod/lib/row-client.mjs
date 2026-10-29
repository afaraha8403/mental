/**
 * One pressable row of the Mental panel, drawn as a `Client` so the whole row
 * is the target: the pointer anywhere on it lights the border and the title,
 * and a click (or Enter once it has the focus) posts `{ press: true }` to the
 * mod's `ui.message` hook, which runs the row's action.
 *
 * A surface module gets no mods API and no imports from the mod; everything it
 * draws comes from `props`. Props are plain data:
 * `{ tag, tagColor, tagWidth, title, detail }`, where `tagColor` is a colour
 * name the host maps to its own theme. Fills are host theme keys so they follow
 * the light or dark theme.
 */

/**
 * @param {{ tag?: string, tagColor?: string, tagWidth?: number, title: string, detail?: string }} props
 * @param {any} surface
 */
export default function MentalRow(props, surface) {
  const { Box, Text } = surface.elements;
  const hot = !!surface.state?.hot;
  // A later call replaces the listener, so setting them on each draw keeps them current.
  // Enter and leave set the state outright: a listener from an earlier draw can
  // hold a stale `hot`, and skipping on it left rows lit after the pointer left.
  surface.onPointer((e) => {
    if (e.type === "enter") surface.setState({ hot: true });
    else if (e.type === "leave") surface.setState({ hot: false });
    else if (e.type === "up" && e.button === "left") surface.post({ press: true });
  });
  surface.onKey((e) => {
    if (e.key === "return") surface.post({ press: true });
  });

  const children = [];
  if (props.tag) {
    children.push(
      Box({
        key: "tag",
        width: props.tagWidth || 11,
        flexShrink: 0,
        children: [Text({ bold: true, ...(props.tagColor ? { color: props.tagColor } : {}), children: [props.tag] })],
      }),
    );
  }
  children.push(
    Box({
      key: "title",
      flexGrow: 1,
      flexShrink: 1,
      children: [Text({ wrap: "truncate-end", ...(hot ? { color: "cyan", bold: true } : {}), children: [props.title] })],
    }),
  );
  if (props.detail) children.push(Text({ dimColor: !hot, children: [hot ? `${props.detail} ›` : props.detail] }));

  return Box({
    flexDirection: "row",
    alignItems: "center",
    gap: 1,
    paddingX: 1,
    borderStyle: "round",
    backgroundColor: hot ? "memoryBackgroundColor" : "userMessageBackground",
    ...(hot ? { borderColor: "cyan" } : { borderDimColor: true }),
    children,
  });
}
