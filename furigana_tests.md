# Furigana Testing

## Basics

### Single Kanji

{紫|むらさき}　`test`
<ruby>紫<rt>むらさき</rt></ruby>　`expected`

{紫|むらさき}　`test`
<ruby>紫<rt>むらさき</rt></ruby>　`expected`

### Two Kanji Consecutive

{漢|かん}{字|じ}　`test`
<ruby>漢<rt>かん</rt></ruby><ruby>字<rt>じ</rt></ruby>　`expected`

### Two Kanji Integrated

{漢字|かん|じ}　`test`
<ruby>漢<rt>かん</rt>字<rt>じ</rt></ruby>　`expected`

### Two Kanji one Furigana Group (e.g. for Jukujikun Words)

{明日|あした}　`test`
<ruby>明日<rt>あした</rt></ruby>　`expected`

### One Kanji with Okurigana — Explicit

{救えない|すく|}　`test`
<ruby>救<rt>すく</rt>えない</ruby>　`expected`

### Two Kanji with Okurigana — Explicit

{躊躇い|た|めら|}　`test`
<ruby>躊<rt>た</rt>躇<rt>めら</rt>い</ruby>　`expected`

### Two Kanji with Okurigana — Implicit

{躊躇い|た|めら}　`test`
<ruby>躊<rt>た</rt>躇<rt>めら</rt>い</ruby>　`expected`

### Furigana on Hiragana

{は|は}　`test`
<ruby>は<rt>は</rt></ruby>　`expected`

{漢字は|かん|じ|は}　`test`
<ruby>漢<rt>かん</rt>字<rt>じ</rt>は<rt>は</rt></ruby>　`expected`

### Kana in the Middle

The kana are not automatically skipped:

{打ち合わせる|う|あ}　`test`
<ruby>打<rt>う</rt>ち<rt>あ</rt>合わせる</ruby>　`expected`

### The Empty Pipe Skip Test

The kana can *intentionally* be skipped:

{打ち合わせる|う||あ}　`test`
<ruby>打<rt>う</rt>ち<rt></rt>合<rt>あ</rt>わせる</ruby>　`expected`

### Multiple Kanji one group

Awkwardly spread out:

{百舌鳥|もず}　`test`
<ruby>百舌鳥<rt>もず</rt></ruby>　`expected`

If someone wants it to look good:

{百舌鳥||もず}　`test`
<ruby>百<rt></rt>舌<rt>もず</rt>鳥</ruby>　`expected`

## Edge Cases and Special Characters

Language learners often use romaji, or users might use the plugin for English translations above Japanese text. The regex supports this, so it should be documented.

### Romaji Test

{言葉|koto|ba}　`test`
<ruby>言<rt>koto</rt>葉<rt>ba</rt></ruby>　`expected`

### Code / "Escaped"

Because of how escapes are handled by obsidian, the only effective way to display the format without rendering it is using code and code blocks, where it is directly disabled.

The expected results have extra invisible spaces to ensure they render correctly even when the plugin is failing.

`{言葉|こと|ば}`　`test`
`{​言葉|こと|ば​}`　`expected`

`test`

```md
{言葉|こと|ば}
```

`expected`

```md
{​言葉|こと|ば​}
```

### Japanese  ＜｜＞

＜言葉｜こと｜ば＞　`test ＜＞`
《言葉｜こと｜ば》　`test 《》`
<ruby>言<rt>こと</rt>葉<rt>ば</rt></ruby>　`expected`

### Mixed brackets and separators

Preventing this would be complicated and computationally wasteful, so 🤷‍♀️.

{言葉｜こと|ば＞　`test`
<ruby>言<rt>こと</rt>葉<rt>ば</rt></ruby>　`expected`

### Special Characters

{待って、|ま}　`test`
<ruby>待って、<rt>ま</rt></ruby>　`expected`

### Table Test

`test:`

|                             |                        |
| --------------------------- | ---------------------- |
| {言葉\|こと\|ば}でなんか{救えない\|すく\|} | {明日\|あした}は             |
| {言葉                         | こと\|ば}でなんか{救えない\|すく\|} |

`expected` (renders correctly in both live preview and reading mode):

|                                                                      |                                        |
| -------------------------------------------------------------------- | -------------------------------------- |
| <ruby>言<rt>こと</rt>葉<rt>ば</rt></ruby>でなんか<ruby>救<rt>すく</rt>えない</ruby> | <ruby>明日<rt>あした</rt></ruby>は           |
| {言葉                                                                  | こと\|ば}でなんか<ruby>救<rt>すく</rt>えない</ruby> |

### One Kanji with Okurigana — Implicit

This intentionally "doesn't work" (in the sense of producing <ruby>救<rt>すく</rt>えない</ruby>) because the parser assumes that a single group of furigana should be spread across all of the raw characters.

{救えない|すく}　`test`
<ruby>救えない<rt>すく</rt></ruby>　`expected`

## Errors

### Furigana Groups > Characters

Don't render when the number of furigana groups exceeds the number of unannotated characters:

{紫|む|ら|さ|き}　`test`
\{紫\|む\|ら\|さ\|き\}　`expected`

### Empty Base

{|む|ら|さ|き}　`test`
\{\|む\|ら\|さ\|き\}　`expected`
