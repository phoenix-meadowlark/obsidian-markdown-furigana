import {
  Plugin,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
} from "obsidian";
import { RangeSetBuilder } from "@codemirror/state";
import {
  ViewPlugin,
  WidgetType,
  EditorView,
  ViewUpdate,
  Decoration,
  DecorationSet,
} from "@codemirror/view";

// Regular Expression for {base|furi|furi|...} format
const REGEXP =
  /{((?:[\u2E80-\uA4CF\uFF00-\uFFEF])+)((?:\\?\|[^ -\/{-~:-@\[-`]*)+)}/gm;

interface FuriganaSegment {
  base: string;
  furi?: string;
}

/**
 * Unified parsing logic for both Reading Mode and Live Preview.
 */
function parseFurigana(
  baseString: string,
  furiString: string,
): FuriganaSegment[] {
  // The first index will be empty, as the separator is included in the REGEX.
  const furi = furiString.split("|").slice(1);
  const segments: FuriganaSegment[] = [];

  if (furi.length === 1) {
    segments.push({ base: baseString, furi: furi[0] });
    return segments;
  }

  // Use character-by-character mapping for multiple pipes
  const baseChars = baseString.split("");
  for (let i = 0; i < baseChars.length; i++) {
    // In cases where baseChars.length > furi.length, undefined is used to
    // prevent extra empty <rt> tags from being generated. For example:
    //   {打ち合わせる|う||あ}
    //   baseChars = ["打", "ち", "合", "わ", "せ", "る"]
    //   furi = ["う", "", "あ"]
    //   <ruby>　打<rt>う</rt>　ち<rt></rt>　合<rt>あ</rt>　わせる</ruby>
    segments.push({
      base: baseChars[i],
      furi: furi[i],
    });
  }

  return segments;
}

/**
 * Unified DOM node creation for both implementations.
 */
function renderFurigana(baseString: string, furiString: string): HTMLElement {
  const segments = parseFurigana(baseString, furiString);
  const ruby = document.createElement("ruby");

  segments.forEach((seg) => {
    if (seg.furi !== undefined) {
      ruby.appendText(seg.base);
      const rt = ruby.createEl("rt", { text: seg.furi });
      // Make the furigana unselectable to prevent selection ruining
      rt.style.userSelect = "none";
    } else {
      // Append text directly to avoid generating empty <rt> tags
      ruby.append(seg.base);
    }
  });

  return ruby;
}

/**
 * Scans a given text node for furigana syntax, replaces matches with rendered
 * HTML elements, and handles the localized DOM mutations inline without
 * disrupting surrounding sibling nodes. Used for the Live Preview view.
 */
const convertFurigana = (element: Text): Node => {
  const matches = Array.from(element.textContent?.matchAll(REGEXP) || []);
  let lastNode = element;
  for (const match of matches) {
    const container = renderFurigana(match[1], match[2]);
    let offset = lastNode.textContent?.indexOf(match[0]) ?? -1;
    if (offset === -1) continue;

    const nodeToReplace = lastNode.splitText(offset);
    lastNode = nodeToReplace.splitText(match[0].length);
    nodeToReplace.replaceWith(container);
  }
  return element;
};

export default class MarkdownFurigana extends Plugin {
  public postprocessor: MarkdownPostProcessor = (
    el: HTMLElement,
    _ctx: MarkdownPostProcessorContext,
  ) => {
    function replace(node: Node) {
      const childrenToReplace: Text[] = [];
      node.childNodes.forEach((child) => {
        if (child.nodeType === 3) {
          // Nodes of Type 3 are TextElements
          childrenToReplace.push(child as Text);
        } else if (
          child.hasChildNodes() &&
          child.nodeName !== "CODE" &&
          child.nodeName !== "RUBY"
        ) {
          // Ignore content in Code Blocks and already rendered Ruby tags
          replace(child);
        }
      });
      childrenToReplace.forEach((child) => {
        child.replaceWith(convertFurigana(child));
      });
    }

    // Begin recursive traversal from the absolute root of the passed fragment
    replace(el);
  };

  async onload() {
    console.log("loading Markdown Furigana plugin");
    this.registerMarkdownPostProcessor(this.postprocessor);
    this.registerEditorExtension(viewPlugin);
  }

  onunload() {
    console.log("unloading Markdown Furigana plugin");
  }
}

class RubyWidget extends WidgetType {
  constructor(
    readonly baseString: string,
    readonly furiString: string,
  ) {
    super();
  }

  toDOM(_view: EditorView): HTMLElement {
    return renderFurigana(this.baseString, this.furiString);
  }
}

class FuriganaViewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.viewportChanged || update.selectionSet) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    let builder = new RangeSetBuilder<Decoration>();
    let lines: number[] = [];
    if (view.state.doc.length > 0) {
      lines = Array.from({ length: view.state.doc.lines }, (_, i) => i + 1);
    }

    const currentSelections = [...view.state.selection.ranges];

    for (let n of lines) {
      const line = view.state.doc.line(n);
      let matches = Array.from(line.text.matchAll(REGEXP));
      for (const match of matches) {
        const [_fullMatch, baseString, furiString] = match;

        // Calculate global document positions for this furigana match
        const from = match.index != undefined ? match.index + line.from : -1;
        const to = from + match[0].length;

        // Check if the cursor is actively touching/editing this specific block
        let isEditing = false;
        currentSelections.forEach((r) => {
          if (r.to >= from && r.from <= to) {
            isEditing = true;
          }
        });
        if (!isEditing) {
          builder.add(
            from,
            to,
            Decoration.widget({
              widget: new RubyWidget(baseString, furiString),
            }),
          );
        }
      }
    }
    return builder.finish();
  }
}

const viewPlugin = ViewPlugin.fromClass(FuriganaViewPlugin, {
  decorations: (v) => v.decorations,
});
