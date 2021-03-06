import { ContextProvider } from "./types";
import { Diagnostic } from "../../types";
import { validateExpressions } from "./validator";

const contextProvider: ContextProvider = {
  get: (context) => {
    switch (context) {
      case "env": {
        return {
          FOO: "AWS_TOKEN",
          BAR_TEST: "",
        };
      }

      case "secrets": {
        return { AWS_TOKEN: true };
      }
    }

    return [];
  },
};

const testValidation = async (input: string, expected: Diagnostic[]) => {
  const errors: Diagnostic[] = [];
  validateExpressions(input, 0, errors, contextProvider);
  expect(errors).toEqual(expected);
};

describe("validation", () => {
  describe("parsing error", () => {
    it("unknown operator", async () => {
      await testValidation("${{ 1 === 4 }}", [
        {
          message: "Invalid expression",
          pos: [0, 14],
        },
      ]);
    });

    it("array access", () => testValidation("${{ secrets[env.FOO] }}", []));
  });

  describe("for contexts", () => {
    it("unknown context", async () => {
      await testValidation("${{ foo.test }}", [
        {
          message: "Invalid expression",
          pos: [0, 15],
        },
      ]);
    });

    it("unknown context acesss", async () => {
      await testValidation("${{ github.test }}", [
        { message: "Unknown context access: 'github.test'", pos: [0, 18] },
      ]);
    });
  });

  describe("multiple expressions", () => {
    it("partial error", () =>
      testValidation("${{ foo.test }} ${{ env.FOO }}", [
        { message: "Invalid expression", pos: [0, 15] },
      ]));

    it("multiple errors", () =>
      testValidation("${{ foo.test }} ${{ foo.test }}", [
        { message: "Invalid expression", pos: [0, 15] },
        { message: "Invalid expression", pos: [16, 31] },
      ]));
  });
});
