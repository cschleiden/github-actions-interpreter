import { Context, DiagnosticKind } from "../../types";

import { ContextProviderFactory } from "../parser/complete";
import { DynamicContext } from "../expressions/types";
import { EditContextProvider } from "./contextProvider";
import { PropertyPath } from "../utils/path";
import { Workflow } from "../workflow";
import { _getSchema } from "./workflowSchema";
import { parse } from "../parser/parser";

const context: Context = {
  client: null,
  owner: "owner",
  repository: "repository",
};
const WorkflowSchema = _getSchema(context);
const ExpressionContextProviderFactory: ContextProviderFactory = {
  get: async (workflow: Workflow, path: PropertyPath) =>
    new EditContextProvider(workflow, path, []),
};

describe("validation", () => {
  const testValidation = async (input: string) => {
    return (
      await parse(
        "workflow.yml",
        input,
        WorkflowSchema,
        ExpressionContextProviderFactory
      )
    ).diagnostics;
  };

  describe("expressions", () => {
    it("in string", async () => {
      expect(
        await testValidation(`on: push
env:
  secret_name: test
  test: 42
jobs:
  first:
    runs-on: [ubuntu-latest]
    steps:
      - name: pass secret value
        run: echo "::set-env name=secret_value::\${{ env[env.secret_name] }}"`)
      ).toEqual([]);
    });

    it("failure() in steps", async () => {
      expect(
        await testValidation(`on: push
env:
  secret_name: test
  test: 42
jobs:
  first:
    runs-on: [ubuntu-latest]
    steps:
      - run: ./doSomething
      - if: \${{ failure() }}
        run: echo "Previous step failed"`)
      ).toEqual([]);
    });
  });

  describe("environments", () => {
    it("as string", async () => {
      expect(
        await testValidation(`on: push
jobs:
  first:
    runs-on: [ubuntu-latest]
    environment: Prod
    steps:
      - run: echo Hello`)
      ).toEqual([]);
    });

    it("as object", async () => {
      expect(
        await testValidation(`on: push
jobs:
  first:
    runs-on: [ubuntu-latest]
    environment:
      name: prod
      url: https://www.github.com
    steps:
      - run: echo Hello`)
      ).toEqual([]);
    });

    it("as invalid object", async () => {
      expect(
        await testValidation(`on: push
jobs:
  first:
    runs-on: [ubuntu-latest]
    environment:
      name: prod
      url2: https://www.github.com
    steps:
      - run: echo Hello`)
      ).toEqual([
        {
          kind: 0,
          message: "Key 'url2' is not allowed",
          pos: [93, 97],
        },
      ]);
    });
  });

  describe("needs", () => {
    it("validates successfully", async () => {
      expect(
        await testValidation(`on: push
jobs:
  build:
    runs-on: [ubuntu-latest]
    steps:
      - run: echo 1
  test:
    runs-on: [ubuntu-latest]
    needs: build
    steps:
      - run: echo 1`)
      ).toEqual([]);
    });

    it("validates missing jobs", async () => {
      expect(
        await testValidation(`on: push
jobs:
  test:
    runs-on: [ubuntu-latest]
    needs: build
    steps:
      - run: echo 1`)
      ).toEqual([
        {
          kind: DiagnosticKind.Error,
          message: "'build' is not in the list of allowed values",
          pos: [63, 68],
        },
      ]);
    });

    it("validates missing some jobs", async () => {
      expect(
        await testValidation(`on: push
jobs:
  build:
    runs-on: [ubuntu-latest]
    steps:
      - run: echo 1
  test:
    runs-on: [ubuntu-latest]
    needs: [build, setup]
    steps:
      - run: echo 1`)
      ).toEqual([
        {
          kind: DiagnosticKind.Error,
          message: "'setup' is not in the list of allowed values",
          pos: [140, 145],
        },
      ]);
    });
  });

  describe("step outputs", () => {
    it("validates referenced step exists", async () => {
      expect(
        await testValidation(`on: push
jobs:
  test:
    runs-on: [ubuntu-latest]
    steps:
      - run: echo 1
        if: \${{ steps.build.outputs.did_warn }}`)
      ).toEqual([
        {
          kind: DiagnosticKind.Error,
          message: "Unknown context access: 'steps.build.outputs.did_warn'",
          pos: [95, 130],
        },
      ]);
    });

    it("validates dynamic output", async () => {
      expect(
        await testValidation(`on: push
jobs:
  test:
    runs-on: [ubuntu-latest]
    steps:
      - id: build
        run: echo
      - if: \${{ steps.build.outputs.did_warn }}
        run: echo 1`)
      ).toEqual([]);
    });
  });

  describe("secrets without API client", () => {
    it("does not report error", async () => {
      const dynamicSecretsExpressionContextProviderFactory: ContextProviderFactory = {
        get: async (workflow: Workflow, path: PropertyPath) =>
          new EditContextProvider(workflow, path, DynamicContext),
      };

      expect(
        (
          await parse(
            "workflow.yml",
            `on: push
jobs:
  test:
    runs-on: [ubuntu-latest]
    steps:
      - run: echo \${{ secrets.TEST }}`,
            WorkflowSchema,
            dynamicSecretsExpressionContextProviderFactory
          )
        ).diagnostics
      ).toEqual([]);
    });
  });

  describe("runs-on", () => {
    it("runs-on allows expressions", async () => {
      expect(
        await testValidation(
          `on: push
env:
  R: ubuntu-latest

jobs:
  test:
    runs-on: \${{ env.R }}

    steps:
      - run: echo hello`
        )
      ).toEqual([]);
    });

    it("runs-on expressions have to match allowed value", async () => {
      expect(
        await testValidation(
          `on: push
env:
  R: does-not-exist

jobs:
  test:
    runs-on: \${{ env.R }}

    steps:
      - run: echo hello`
        )
      ).toEqual([
        {
          kind: 0,
          message: "'does-not-exist' is not in the list of allowed values",
          pos: [62, 74],
        },
      ]);
    });

    it("runs-on expressions support fromJson", async () => {
      expect(
        await testValidation(
          `on: push

jobs:
  test:
    runs-on: \${{ fromJson('["ubuntu-latest", "self-hosted"]')[1 == 2] }}

    steps:
      - run: echo hello`
        )
      ).toEqual([]);
    });

    it("runs-on expressions checks fromJson for valid values", async () => {
      expect(
        await testValidation(
          `on: push

env:
  R: 2

jobs:
  test:
    runs-on: \${{ fromJson('["ubuntu-latest", "does-not-exist"]')[env.R == 2] }}

    steps:
      - run: echo hello`
        )
      ).toEqual([
        {
          kind: 0,
          message: "'does-not-exist' is not in the list of allowed values",
          pos: [50, 116],
        },
      ]);
    });
  });

  describe("matrix", () => {
    it("matrix allows arbitrary keys", async () => {
      expect(
        await testValidation(
          `on: push
jobs:
  test:
    runs-on: [ubuntu-latest]

    strategy:
      matrix:
        os: [win, linux]
        node: [8, 12]

    steps:
      - run: echo \${{ matrix.os }}`
        )
      ).toEqual([]);
    });

    it("include defines allowed matrix keys", async () => {
      expect(
        await testValidation(
          `on: push
jobs:
  test:
    runs-on: [ubuntu-latest]

    strategy:
      matrix:
        include:
          - os: win
            node: 8
          - os: linux
            node: 12
            experimental: true

    steps:
      - run: echo \${{ matrix.os }} \${{ matrix.node }} \${{ matrix.experimental }}`
        )
      ).toEqual([]);
    });
  });
});
