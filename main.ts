import {
  Plugin,
  MarkdownPostProcessor,
  MarkdownPostProcessorContext,
  editorLivePreviewField,
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
import { syntaxTree } from "@codemirror/language";

type WrapperPair = [string, string];

const FURI_WRAPPERS: WrapperPair[] = [
  ["{", "}"],
  ["＜", "＞"],
  ["《", "》"],
];

const FURI_SEPARATORS = ["|", "｜"];

/**
 * Escapes special regex characters in a string to treat them as literals.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Build the global furigana RegExp from provided wrappers and separators.
 */
function buildFuriganaRegex(
  wrappers: WrapperPair[],
  separators: string[],
): RegExp[] {
  // Build the separator pattern.
  const separatorPattern = [...separators].map(escapeRegex).join("|");

  // 2. Build Wrapper Patterns
  const openPattern = wrappers.map((w) => escapeRegex(w[0])).join("|");
  const closePattern = wrappers.map((w) => escapeRegex(w[1])).join("|");
  const closeChars = escapeRegex(wrappers.map((w) => w[1]).join(""));

  // Assemble the full furigana regex string
  const regexPattern =
    // Open Wrapper(s)
    `(?<!\\\\)(?:${openPattern})` +
    // Capture Group 1: Base characters (e.g. Kanji) Excluding Separators
    `((?:(?!${separatorPattern})[\\u2E80-\\uA4CF\\uFF00-\\uFFEF])+)` +
    // Capture Group 2: Furigana sections
    `((?:(?:${separatorPattern})[^${closeChars}]*)+)` +
    // Close Wrapper(s)
    `(?<!\\\\)(?:${closePattern})`;

  const furiRegex = new RegExp(regexPattern, "gm");
  const separatorRegex = new RegExp(separatorPattern);

  return [furiRegex, separatorRegex];
}

// Regular Expression for {{base|furi|furi|...}} format
const [FURI_REGEX, SEPARATOR_REGEX] = buildFuriganaRegex(
  FURI_WRAPPERS,
  FURI_SEPARATORS,
);

/**
 * Pairs a base of one or more characters with their furigana.
 */
interface FuriganaPair {
  base: string;
  furi?: string;
}

/**
 * Unified parsing logic for both Reading View and Live Preview.
 */
function parseFurigana(
  baseString: string,
  furiString: string,
): FuriganaPair[] | null {
  // The first index will be empty, as the separator is included in the REGEX.
  const furiGroups = furiString.split(SEPARATOR_REGEX).slice(1);
  const furiPairs: FuriganaPair[] = [];

  if (furiGroups.length === 1) {
    furiPairs.push({ base: baseString, furi: furiGroups[0] });
    return furiPairs;
  }

  // Use character-by-character mapping for multiple pipes
  const baseGroups = baseString.split("");

  // If syntax is invalid (e.g., {紫|む|ら|さ|き}), return null to skip rendering
  if (furiGroups.length > baseGroups.length) return null;

  for (let i = 0; i < baseGroups.length; i++) {
    // In cases where baseGroups.length > furiGroups.length, undefined is used
    // to prevent extra empty <rt> tags from being generated. For example:
    //   {打ち合わせる|う||あ}
    //   baseGroups = ["打", "ち", "合", "わ", "せ", "る"]
    //   furiGroups = ["う", "", "あ"]
    //   <ruby>　打<rt>う</rt>　ち<rt></rt>　合<rt>あ</rt>　わせる</ruby>
    furiPairs.push({ base: baseGroups[i], furi: furiGroups[i] });
  }

  return furiPairs;
}

/**
 * Unified DOM node creation for both implementations.
 */
function renderFurigana(furiPairs: FuriganaPair[]): HTMLElement {
  const ruby = document.createElement("ruby");
  furiPairs.forEach((pair) => {
    if (pair.furi !== undefined) {
      ruby.appendText(pair.base);
      const rt = ruby.createEl("rt", { text: pair.furi });

      // Prevent furigana selection to allow the Reading View content to be
      // copied as coherent sentences.
      rt.style.userSelect = "none"; // Desktop
      rt.style.setProperty("-webkit-user-select", "none"); // iOS Safari
      // Prevent the iOS long-press magnifying glass and context menu
      rt.style.setProperty("-webkit-touch-callout", "none");
    } else {
      // Append text directly to avoid generating empty <rt> tags
      ruby.append(pair.base);
    }
  });
  return ruby;
}

/**
 * Scans a given text node for furigana syntax, replaces matches with rendered
 * HTML elements, and handles the localized DOM mutations inline without
 * disrupting surrounding sibling nodes. Used for the Reading View.
 */
const convertFurigana = (element: Text): Node => {
  const matches = Array.from(element.textContent?.matchAll(FURI_REGEX) || []);
  let lastNode = element;
  for (const match of matches) {
    const [_fullMatch, baseString, furiString] = match;
    const furiPairs = parseFurigana(baseString, furiString);
    if (!furiPairs) continue; // Skip rendering invalid furigana.

    const container = renderFurigana(furiPairs);
    let offset = lastNode.textContent?.indexOf(match[0]) ?? -1;
    if (offset === -1) continue;

    const nodeToReplace = lastNode.splitText(offset);
    lastNode = nodeToReplace.splitText(match[0].length);
    nodeToReplace.replaceWith(container);
  }
  return element;
};

export default class MarkdownFurigana extends Plugin {
  // Required to dynamically toggle Editor Extension without reloading plugin
  extension: ViewPlugin<FuriganaViewPlugin>[] = [];

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

    // Register the extension permanently.
    // The extension will self-regulate based on editorLivePreviewField.
    this.registerEditorExtension(viewPlugin);
  }

  onunload() {
    console.log("unloading Markdown Furigana plugin");
  }
}

class RubyWidget extends WidgetType {
  constructor(readonly furiPairs: FuriganaPair[]) {
    super();
  }

  // Allows CodeMirror to optimize and skip re-rendering identical widgets
  eq(other: RubyWidget): boolean {
    if (this.furiPairs.length !== other.furiPairs.length) {
      return false;
    }

    for (let i = 0; i < this.furiPairs.length; i++) {
      if (
        this.furiPairs[i].base !== other.furiPairs[i].base ||
        this.furiPairs[i].furi !== other.furiPairs[i].furi
      ) {
        return false;
      }
    }

    return true;
  }

  // Allow for clicking on rendered kanji+furigana in Live Preview.
  ignoreEvent(event: Event): boolean {
    return event.type !== "mousedown" && event.type !== "click";
  }

  toDOM(_view: EditorView): HTMLElement {
    return renderFurigana(this.furiPairs);
  }
}

// Phantom Widget to prevent lines from jumping around when switching between
// Source Mode and Live Preview, and when editing the furigana in Live Preview
class PhantomRubyWidget extends WidgetType {
  toDOM(_view: EditorView): HTMLElement {
    // Create a zero-width wrapper to avoid placing display: inline-block
    // on the ruby element itself
    const wrapper = document.createElement("span");
    wrapper.addClass("phantom-ruby-widget");
    wrapper.style.display = "inline-block";
    wrapper.style.width = "0px";
    // Prevent the 0-width box from forcing the text to wrap to a new line
    wrapper.style.whiteSpace = "nowrap";
    // Hide the bleeding content from the user and the cursor
    wrapper.style.visibility = "hidden";

    // Build the ruby element inside the zero-width wrapper, using real
    // characters to guarantee the browser calculates the true bounds
    const ruby = wrapper.createEl("ruby");
    ruby.appendText("奏");
    ruby.createEl("rt", { text: "あ" });

    return wrapper;
  }
}

class FuriganaViewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    // Check if the source mode toggle was flipped
    const layoutChanged =
      update.startState.field(editorLivePreviewField) !==
      update.state.field(editorLivePreviewField);

    if (
      update.docChanged ||
      update.viewportChanged ||
      update.selectionSet ||
      layoutChanged
    ) {
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
    const isLivePreview = view.state.field(editorLivePreviewField);

    for (let n of lines) {
      const line = view.state.doc.line(n);

      let matches = Array.from(line.text.matchAll(FURI_REGEX));
      // Valid furigana groups are not rendered if a user selects them in
      // Live Preview mode, or if Source Mode is enabled.
      let addPhantomWidget = false;
      let widgetsToAdd = [];

      for (const match of matches) {
        const [_fullMatch, baseString, furiString] = match;
        const furiPairs = parseFurigana(baseString, furiString);
        if (!furiPairs) continue; // Skip rendering invalid furigana.

        // Calculate global document positions for this furigana match
        const from = match.index != undefined ? match.index + line.from : -1;
        const to = from + match[0].length;

        // Skip rendering inside of code blocks, mirroring the Reading View.
        const node = syntaxTree(view.state).resolveInner(from, 1);
        if (node.name.includes("code")) {
          continue;
        }

        // Check if the cursor is actively touching/editing this specific block
        let isEditing = false;
        currentSelections.forEach((r) => {
          if (r.to >= from && r.from <= to) {
            isEditing = true;
          }
        });
        if (!isLivePreview || isEditing) {
          addPhantomWidget = true;
        } else {
          widgetsToAdd.push({ from, to, furiPairs });
        }
      }

      // If the line has unrendered valid furigana, inject the phantom widget
      // at the very beginning of the line to match its rendered height.
      if (addPhantomWidget) {
        builder.add(
          line.from,
          line.from,
          Decoration.widget({
            widget: new PhantomRubyWidget(),
            side: -1, // Ensures it sits at the absolute start of the line
          }),
        );
      }

      for (const widget of widgetsToAdd) {
        builder.add(
          widget.from,
          widget.to,
          Decoration.widget({
            widget: new RubyWidget(widget.furiPairs),
          }),
        );
      }
    }
    return builder.finish();
  }
}

const viewPlugin = ViewPlugin.fromClass(FuriganaViewPlugin, {
  decorations: (v) => v.decorations,
});
