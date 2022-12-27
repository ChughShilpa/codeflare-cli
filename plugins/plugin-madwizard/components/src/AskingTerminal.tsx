/*
 * Copyright 2022 The Kubernetes Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import React from "react"
import { Chalk } from "chalk"
import stripAnsi from "strip-ansi"
import { Prompts } from "madwizard"
import { Job } from "@kui-shell/core"
import { Allotment, AllotmentHandle } from "allotment"
import { Loading } from "@kui-shell/plugin-client-common"
import {
  Button,
  EmptyState,
  EmptyStateBody,
  EmptyStateIcon,
  EmptyStatePrimary,
  EmptyStateSecondaryActions,
  Title,
} from "@patternfly/react-core"

import AskUI, { Ask } from "./Ask"
import { Props as BaseProps } from "./RestartableTerminal"
import SelectedProfileTerminal from "./SelectedProfileTerminal"

import BanIcon from "@patternfly/react-icons/dist/esm/icons/ban-icon"
import HomeIcon from "@patternfly/react-icons/dist/esm/icons/home-icon"
import SpinnerIcon from "@patternfly/react-icons/dist/esm/icons/spinner-icon"
import CheckCircleIcon from "@patternfly/react-icons/dist/esm/icons/check-circle-icon"
import ExclamationTriangleIcon from "@patternfly/react-icons/dist/esm/icons/exclamation-triangle-icon"

type Props = {
  terminalProps: Pick<BaseProps, "tab" | "REPL" | "onExit" | "searchable" | "fontSizeAdjust">

  initCount: number
  guidebook: string
  cmdline: string
  env: Record<string, string>
  selectedProfile: string

  /** Return to the initial guidebook */
  home(noninteractive?: boolean): void

  /** Are we doing a guidebook run with minimal user involvement? */
  noninteractive?: boolean
}

type State = {
  /** Current ask for the user */
  ask?: Ask | null

  /** Status of guidebook execution */
  status?: "success" | "cancelled" | "error" | "q&a" | "running"

  /** So we can force a re-init of the terminal */
  myInitCount: number

  /** Terminal job */
  job?: Job
}

/**
 * A UI component that combines <AskUI/> with a terminal.
 *
 */
export default class AskingTerminal extends React.PureComponent<Props, State> {
  private readonly rawPrefix = "MADWIZARD_RAW"
  private readonly extraCommandLine = " --raw --raw-prefix=" + this.rawPrefix

  private readonly allotmentRef = React.createRef<AllotmentHandle>()

  private readonly _sizes = {
    qa: [80, 20],
    noqa: [27, 73],
  }

  private get sizes() {
    return this.state?.ask === null || this.props.noninteractive ? this._sizes.noqa : this._sizes.qa
  }

  public constructor(props: Props) {
    super(props)
    this.state = {
      myInitCount: 0,
    }
  }

  public componentDidUpdate(prevProps: Props, prevState: State) {
    if (this.state && prevState && prevState.ask && prevState.ask !== this.state.ask) {
      setTimeout(() => this.allotmentRef.current?.resize(this.sizes))
    }
  }

  /** Render a UI to indicate we are done with the Q&A */
  private done() {
    const inProgress = this.state.status === "running"
    const icon = inProgress
      ? SpinnerIcon
      : this.state.status === "success"
      ? CheckCircleIcon
      : this.state.status === "cancelled"
      ? BanIcon
      : ExclamationTriangleIcon
    const iconClass = inProgress
      ? "kui--spin-animation yellow-text"
      : this.state.status === "success"
      ? "green-text"
      : this.state.status === "error"
      ? "red-text"
      : ""
    const title = inProgress
      ? "Executing tasks"
      : this.state.status === "success"
      ? "Success!"
      : this.state.status === "cancelled"
      ? "Cancelled"
      : "Failed"
    const body = inProgress
      ? "All questions have now been resolved, and execution of the remaining tasks is now underway"
      : this.state.status === "success"
      ? "All tasks in the guidebook were executed successfully"
      : this.state.status === "cancelled"
      ? "Guidebook execution was cancelled"
      : "Guidebook execution has failed"
    const buttonText = inProgress ? "Cancel" : this.state.status === "success" ? "Repeat this Run" : "Retry this Run"
    const onClick = inProgress ? () => this.state.job && this.state.job.abort("SIGINT") : () => this.props.home(true)

    const homeOnClick = () => this.props.home(false)

    return (
      <EmptyState variant="xs" className="sans-serif flex-fill kui--madwizard-ask-ui">
        <EmptyStateIcon icon={icon} className={iconClass} />
        <Title size="lg" headingLevel="h4">
          {title}
        </Title>

        <EmptyStateBody>{body}</EmptyStateBody>

        <EmptyStatePrimary>
          <Button onClick={onClick}>{buttonText}</Button>
        </EmptyStatePrimary>

        <EmptyStateSecondaryActions>
          <Button className="larger-text" variant="link" icon={<HomeIcon />} onClick={homeOnClick} />
        </EmptyStateSecondaryActions>
      </EmptyState>
    )
  }

  private guide() {
    if (!this.state.status) {
      return <Loading />
    } else if (this.state.status !== "q&a") {
      // done with Q&A
      return this.done()
    } else if (this.state.ask) {
      return <AskUI ask={this.state.ask} home={this.props.home} />
    }
  }

  private leftover = ""

  /** Terminal was initialized */
  private readonly _onTerminalInit = (job: Job) => this.setState({ job })

  /** Terminal process exited */
  private readonly _onTerminalExit = (code: number) =>
    this.setState({ ask: null, status: code === 0 ? "success" : code === 130 ? "cancelled" : "error" })

  /** Terminal emitted a line of content */
  private readonly _onTerminalLine = async (line: string, write: (data: string) => void) => {
    const idx1 = line.indexOf(this.rawPrefix)
    if (idx1 >= 0 || this.leftover) {
      const idx2 = line.indexOf("\n", idx1)
      if (idx2 >= 0) {
        const str = (this.leftover + line.slice(idx1 < 0 ? 0 : idx1, idx2)).slice(this.rawPrefix.length + 1)
        this.leftover = ""
        try {
          const msg = JSON.parse(stripAnsi(str)) as
            | { type: "qa-done" }
            | { type: "all-done"; success: boolean }
            | { type: "ask"; ask: Prompts.Prompt }

          if (msg.type === "qa-done") {
            this.setState({ ask: null, status: "running" })
          } else if (msg.type === "all-done") {
            this.setState({ ask: null, status: msg.success ? "success" : "error" })
          } else {
            const onChoose: Ask["onChoose"] = async (xchoice) => {
              // write choice to stdin
              const choice = await xchoice
              write((typeof choice === "string" ? choice : JSON.stringify(choice)) + "\n")
            }
            const prompt = msg.ask
            const ask = { title: prompt.name || "Make a Choice", description: prompt.description, prompt, onChoose }
            this.setState({ ask, status: "q&a" })
          }
        } catch (err) {
          console.error("Error parsing line", idx1, idx2, line, "|||", str, err)
        }
      } else {
        this.leftover += idx1 === 0 ? line : line.slice(idx1)
      }
      return null
    } else {
      this.leftover = ""
      return line
    }
  }

  /** Placeholder content for terminal */
  private readonly initialTerminalContent = new Chalk({ level: 2 }).dim.italic("Logs will appear here")

  /** React `key` prop for terminal */
  private get terminalKey() {
    return (
      this.state.myInitCount + "_" + this.props.initCount + "_" + this.props.cmdline + "-" + this.props.selectedProfile
    )
  }

  private terminal() {
    return (
      <SelectedProfileTerminal
        searchable={false}
        env={this.props.env}
        key={this.terminalKey}
        initialContent={this.initialTerminalContent}
        fontSizeAdjust={1 /* relative to 14px */}
        cmdline={this.props.cmdline + this.extraCommandLine}
        selectedProfile={this.props.selectedProfile}
        onInit={this._onTerminalInit}
        onExit={this._onTerminalExit}
        intercept={this._onTerminalLine /* intercept terminal output lines */}
        restartOnExit={false /* don't auto-restart on exit */}
        {...this.props.terminalProps}
      />
    )
  }

  public render() {
    return (
      <Allotment vertical defaultSizes={this.sizes} ref={this.allotmentRef}>
        <Allotment.Pane preferredSize={this.sizes[0]}>{this.guide()}</Allotment.Pane>
        <Allotment.Pane preferredSize={this.sizes[1]}>{this.terminal()}</Allotment.Pane>
      </Allotment>
    )
  }
}
