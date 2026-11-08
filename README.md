# Claude-VScode HUD

A Claude Code mod (plugin name `vscode-hud`) that draws a one-line band above
the prompt with your subscription usage, plus a Status button on the right that opens
the rest of what you want to see while an agent works.

```
5h 17% 3:20 AM  Weekly 54% Nov 11                    [Status]
```

![The band above the prompt](docs/band.svg)

The image is an illustration of the layout, not a screenshot. The numbers in it
are made up.

## The usage row

Each window shows the percentage used and when it resets: a clock time if the
reset is within 24 hours, otherwise a date. The percentage is green below 50%,
yellow from 50% to 80%, and red from 80%. The row stays empty until Claude Code
reports rate-limit data, which only happens on a subscription plan after the
first reply.

## The Status button

Press `Status` (or `s` while the band has focus) to open or close these lines.
Lines with no data yet are left out.

| Line | What it shows |
| --- | --- |
| Model | The session model id |
| Project | The working folder name |
| Branch | The git branch and the number of changed files, for example `main +2` |
| Context | Context window used, for example `42% (84k/200k)` |
| Cost | The session cost in US dollars, where Claude Code keeps a ledger |
| Last turn | How long the last turn took and how many tool calls it made |
| Todos | The agent's todo progress and the task in progress |

The git lines run read-only `git branch --show-current` and `git status
--porcelain` in the session folder, after each turn. Nothing is sent anywhere.

The band is drawn on the terminal, desktop and VS Code surfaces. In VS Code the
host adds its own "From the vscode-hud plugin" label and frame around it.

## Theme

Colors are theme roles (success, warning, error and the dim text style), not fixed
hex values, so the host paints them from your own VS Code theme. The band adds
no background of its own. Switching the theme restyles it with no setting.

## Install

At the prompt of a terminal session:

```
/plugin install vscode-hud --marketplace LuuHung247/Claude-VScode-HUD
```

From a shell:

```
claude plugin install vscode-hud --marketplace LuuHung247/Claude-VScode-HUD
```

Answer `y` to add the marketplace, then choose a scope. Claude Code 2.1.319 or
newer is required.

## Develop

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .
```

## Related projects

The HUD idea comes from [jarrodwatts/claude-hud](https://github.com/jarrodwatts/claude-hud),
which shows context, tools, agents and todos in the status line. This mod draws
above the prompt instead, using Claude Code's mod API.

## License

MIT
