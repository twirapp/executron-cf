import { getSandbox } from "@cloudflare/sandbox";
import { createHash, randomInt } from "node:crypto";

export { Sandbox } from "@cloudflare/sandbox";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json(
        {
          error: "should be post request",
        },
        {
          status: 400,
        },
      );
    }

    const reqData = await request.json<{
      code?: string;
      userId?: string;
      language?: "python" | "javascript" | "typescript";
    }>();
    if (!reqData.code) {
      return Response.json(
        {
          error: "No code provided",
        },
        { status: 400 },
      );
    }

    if (
      reqData.language &&
      !["python", "javascript", "typescript"].includes(reqData.language)
    ) {
      return Response.json(
        {
          error: `Unsupported language: ${reqData.language}`,
        },
        { status: 400 },
      );
    }

    let ctxId: string | null = null;
    // const codeId =
    //   reqData.userId ??
    //   createHash("sha256").update(reqData.code).digest("hex").slice(0, 40);
    // const sandBoxId = `executron-${codeId.toLowerCase()}`;
    const sandBoxId = `executron-${randomInt(1, 4)}`; // max=containers count + 1 from wrangler configuration
    const sandbox = getSandbox(env.Sandbox, sandBoxId);

    const lang = reqData.language ?? "typescript";

    console.log(`Executing code on ${lang} for ${sandBoxId}`);

    try {
      if (lang == "javascript" || lang === "typescript") {
        const tmpFilePath = `/tmp/code${sandBoxId + Date.now()}.mts`;
        await sandbox.writeFile(
          tmpFilePath,
          `
          import _ from 'lodash';
          const fetch = global.fetch;

          console.log(await (async () => {
            ${reqData.code}
          })());
        `,
        );
        const result = await sandbox.exec(`bun ${tmpFilePath}`, {
          timeout: 5000,
        });

        await sandbox.exec(`rm ${tmpFilePath}`);

        return Response.json({
          result: result.stdout ?? null,
          error: result.stderr ?? null,
        });
      }

      const ctx = await sandbox.createCodeContext({
        language: lang,
      });
      ctxId = ctx.id;

      const result = await sandbox.runCode(reqData.code!, {
        context: ctx,
        timeout: 5000,
      });

      return Response.json({
        result: result.results?.at(0)?.text ?? null,
        error: result.error ?? null,
      });
    } catch (e) {
      return Response.json(
        {
          error: `${e}`,
        },
        { status: 500 },
      );
    } finally {
      if (ctxId) {
        await sandbox.deleteCodeContext(ctxId);
      }

      // await sandbox.destroy();
    }
  },
};
