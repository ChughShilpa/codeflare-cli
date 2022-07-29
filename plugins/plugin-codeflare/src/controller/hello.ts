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

import { Arguments } from "@kui-shell/core"

import "../../web/scss/components/Hello/_index.scss"

export async function gallery() {
  const React = await import("react")
  const CodeFlareGallery = await import("../components/CodeFlareGallery")
  return {
    react: React.createElement(CodeFlareGallery.default, {}),
  }
}

export async function dashboardGallery(args: Arguments) {
  const React = await import("react")
  const CodeFlareDashboardGallery = await import("../components/CodeFlareDashboardGallery")
  return {
    react: React.createElement(CodeFlareDashboardGallery.default, { args }),
  }
}

export default function hello(args: Arguments) {
  return args.REPL.qexec("commentary --readonly -f /kui/client/hello.md")
}
