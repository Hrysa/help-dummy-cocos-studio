import * as vscode from "vscode";
import * as path from "path";
import { existsSync, readdir } from "fs";
import { watch, FSWatcher } from "chokidar";
import { ChildProcess, exec, fork } from "child_process";
import * as iconv from "iconv-lite";

let watcher!: FSWatcher;
let rootPath = "";
let cb: any;
let child: ChildProcess;
let channel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
  rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || "";
  const config = path.join(rootPath, ".hdcs");
  if (!existsSync(config)) return;

  initFileWatch();

  initSocket();

  channel = vscode.window.createOutputChannel("hdcs");

  let disposable = vscode.commands.registerCommand(
    "help-dummy-cocos-studio.pack",
    async () => {
      const list = await new Promise<string[] | Error>((resolve) =>
        readdir("D:\\threeking\\trunk\\client\\art\\ui", (_, list) =>
          resolve(list || _)
        )
      );
      if (list instanceof Array) {
        const choice = await vscode.window.showQuickPick(list, {
          placeHolder: "选择需要打包的文件夹名称",
        });
        if (!choice) return;
        packUI(choice);
      } else {
        vscode.window.showErrorMessage("获取文件夹信息失败");
      }
    }
  );

  context.subscriptions.push(disposable);

  const reload = async (uri: vscode.Uri) => {
    const file = [];

    // under src like app.sprite.SkillAni
    if (uri.fsPath.includes("src\\")) {
      file[0] =
        uri.fsPath
          .split("src\\")
          .pop()
          ?.replace(".lua", "")
          .replace(/\\/g, ".") || "";
    }

    // under res\ui like PATH\client_jp\res\ui\login\file.lua
    // rule:
    // 0 res/ui/login/file.lua
    // 1 ui/login/file.lua
    // 2 ui/login/file
    else if (uri.fsPath.includes("res\\ui\\")) {
      file[0] =
        uri.fsPath.split("client_jp\\").pop()?.replace(/\\/g, "/") || "";
      file[1] = file[0].replace("res/", "");
      file[2] = file[1].replace(".lua", "");
    }

    // under res like data.Config_spot
    else if (uri.fsPath.includes("res\\")) {
      file[0] =
        uri.fsPath
          .split("res\\")
          .pop()
          ?.replace(".lua", "")
          .replace(/\\/g, ".") || "";
    } else {
      return;
    }
    reloadFile(...file);
  };
  disposable = vscode.commands.registerCommand(
    "help-dummy-cocos-studio.reloadFileFromGame",
    reload
  );

  vscode.workspace.onDidSaveTextDocument((document: vscode.TextDocument) => {
    reload(document.uri);
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function reloadFile(...list: string[]) {
  cb = (m: any) => {
    if (m === "nil") {
      vscode.window.showInformationMessage("文件重载成功");
    }
  };
  const s = list.map((v) => `_.reload("${v}"); `).join("");
  child.send(`(function() ${s} end )()`);
}

function initFileWatch() {
  const regxPath = rootPath + "\\cocosstudio\\ui\\**\\*.csd";
  watcher = watch(regxPath, {
    ignoreInitial: true,
    ignored: /.+PList\.Dir/,
    depth: 1,
  })
    .on("change", (p) => {
      const cmd =
        "D:\\threeking\\trunk\\client\\client_jp\\csdToLua\\single.bat";

      const filename = path.basename(p);
      const name = filename.slice(0, -4);
      const dirname = path.basename(path.dirname(p));
      new Promise((resolve) => setTimeout(resolve, 500));
      exec(
        `${cmd.replace(/\\\\/g, "\\")} ${dirname} ${name}`,
        { encoding: "binary" },
        function (e, stdout, stderr) {
          if (stderr || e) {
            channel.append(encode(e)!);
            channel.append(encode(stderr)!);
            vscode.window.showErrorMessage("CSD文件生成失败: " + name);
          } else {
            reloadFile(`ui/${dirname}/${name}.lua`, `ui/${dirname}/${name}`);
          }
        }
      );
    })
    .on("ready", () => {
      vscode.window.showInformationMessage("CSD文件监听中...");
    })
    .on("error", (e) => {
      channel.append(encode(e)!);
      vscode.window.showErrorMessage("CSD文件监听失败");
    });
}

function packUI(name: string) {
  vscode.window.showInformationMessage("资源打包中...");
  exec(
    "D:\\threeking\\trunk\\client\\art\\ui\\createPngWithTexturePacker_byName2.bat " +
      name,
    { encoding: "binary" },
    (e, stdout, stderr) => {
      if (stderr || e) {
        channel.append(encode(e)!);
        channel.append(encode(stderr)!);
        vscode.window.showErrorMessage("打包资源失败: " + name);
      } else vscode.window.showInformationMessage("打包完成");
    }
  );
}

function initSocket() {
  child = fork(path.join(__dirname, "ipc-child.js"));
  child.on("message", (m) => {
    if (
      m === "new client try to connect, refused" ||
      m === "ERROR no client found"
    )
      vscode.window.showWarningMessage(m);
    else if (m.includes("new client connected"))
      vscode.window.showInformationMessage(m);

    if (m != "nil") channel.append(encode(m)!);
    cb && cb(m);
  });
  child.on("error", (err) => {
    channel.append(encode(err.toString())!);
    vscode.window.showErrorMessage("创建Socket失败");
  });
  child.on("exit", () => channel.append(encode("child process exit")!));
}

const encode = (s: any) =>
  s && s.toString
    ? iconv.decode(Buffer.from(s.toString(), "binary"), "cp936")
    : undefined;
