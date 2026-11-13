// DataFutureX Note 单文件安装器（不使用 NSIS）
// 布局：stub.exe + marker + zip(win-unpacked 内容)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    private const string Marker = "DFX_APP_PAYLOAD_V1";
    private const string AppFolderName = "DataFutureX-Note";
    private const string ExeName = "DataFutureX Note.exe";
    private const string DisplayName = "DataFutureX Note（数字未来笔记）";
    private const string ShortcutName = "DataFutureX Note.lnk";
    private const string DesktopShortcutName = "DataFutureX Note.lnk";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\DataFutureX-Note";

    [STAThread]
    private static int Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);

        try
        {
            string presetDir = null;
            if (args != null)
            {
                foreach (string a in args)
                {
                    if (string.Equals(a, "/uninstall", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a, "--uninstall", StringComparison.OrdinalIgnoreCase))
                        return Uninstall();
                    if (a.StartsWith("--dir=", StringComparison.OrdinalIgnoreCase))
                        presetDir = a.Substring(6).Trim().Trim('"');
                    else if (a.StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
                        presetDir = a.Substring(3).Trim().Trim('"');
                }
            }

            return RunInstallUi(presetDir);
        }
        catch (Exception ex)
        {
            try
            {
                WriteErrorLog(ex);
                MessageBox.Show("安装失败：\n" + ex.Message, DisplayName,
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch { }
            return 1;
        }
    }

    private static int RunInstallUi(string presetDir)
    {
        string selfPath = Process.GetCurrentProcess().MainModule.FileName;
        string selfDir = Path.GetDirectoryName(selfPath) ?? Environment.CurrentDirectory;
        string defaultDir = !string.IsNullOrEmpty(presetDir)
            ? NormalizeInstallDir(presetDir)
            : GetDefaultInstallDir(selfDir);

        var form = new Form
        {
            Text = DisplayName + " 安装",
            Width = 520,
            Height = 260,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen,
            ShowInTaskbar = true
        };

        var title = new Label
        {
            Left = 20, Top = 16, Width = 460, Height = 24,
            Text = "请选择安装路径，然后点击「开始安装」",
            Font = new Font(SystemFonts.MessageBoxFont, FontStyle.Bold)
        };
        var pathBox = new TextBox
        {
            Left = 20, Top = 52, Width = 360, Height = 24,
            Text = defaultDir
        };
        var browseBtn = new Button
        {
            Left = 390, Top = 50, Width = 90, Height = 28,
            Text = "浏览…"
        };
        var status = new Label
        {
            Left = 20, Top = 92, Width = 460, Height = 36,
            Text = "默认路径可直接安装，也可浏览选择其他文件夹。"
        };
        var bar = new ProgressBar
        {
            Left = 20, Top = 136, Width = 460, Height = 22,
            Style = ProgressBarStyle.Marquee,
            MarqueeAnimationSpeed = 30,
            Visible = false
        };
        var installBtn = new Button
        {
            Left = 280, Top = 176, Width = 100, Height = 30,
            Text = "开始安装"
        };
        var cancelBtn = new Button
        {
            Left = 390, Top = 176, Width = 90, Height = 30,
            Text = "取消"
        };

        form.Controls.Add(title);
        form.Controls.Add(pathBox);
        form.Controls.Add(browseBtn);
        form.Controls.Add(status);
        form.Controls.Add(bar);
        form.Controls.Add(installBtn);
        form.Controls.Add(cancelBtn);
        form.AcceptButton = installBtn;
        form.CancelButton = cancelBtn;

        // 管理员提权重进时，若路径可写则自动开始安装
        bool autoStart = !string.IsNullOrEmpty(presetDir);
        form.Shown += delegate
        {
            if (!autoStart) return;
            string err;
            if (CanWriteDir(pathBox.Text.Trim(), out err))
                installBtn.PerformClick();
            else
                status.Text = "已请求管理员权限，但仍无法写入，请更换路径。\n" + err;
        };

        browseBtn.Click += delegate
        {
            using (var dlg = new FolderBrowserDialog())
            {
                dlg.Description = "选择安装目录（将安装到所选文件夹下的 DataFutureX-Note，或直接选中该文件夹）";
                string cur = pathBox.Text.Trim();
                try
                {
                    if (!string.IsNullOrEmpty(cur))
                    {
                        string parent = Directory.Exists(cur) ? cur : Path.GetDirectoryName(cur);
                        if (Directory.Exists(parent)) dlg.SelectedPath = parent;
                    }
                }
                catch { }
                if (dlg.ShowDialog(form) == DialogResult.OK && !string.IsNullOrEmpty(dlg.SelectedPath))
                {
                    string selected = dlg.SelectedPath.TrimEnd('\\');
                    if (string.Equals(Path.GetFileName(selected), AppFolderName, StringComparison.OrdinalIgnoreCase))
                        pathBox.Text = selected;
                    else
                        pathBox.Text = Path.Combine(selected, AppFolderName);
                }
            }
        };

        cancelBtn.Click += delegate { form.Close(); };

        int result = 1;
        installBtn.Click += delegate
        {
            string installDir;
            try
            {
                installDir = NormalizeInstallDir(pathBox.Text);
            }
            catch (Exception pathEx)
            {
                MessageBox.Show(form, "安装路径无效：\n" + pathEx.Message, DisplayName,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrEmpty(installDir))
            {
                MessageBox.Show(form, "请填写安装路径。", DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            pathBox.Text = installDir;

            string err;
            if (!CanWriteDir(installDir, out err))
            {
                if (IsProtectedSystemPath(installDir))
                {
                    var elev = MessageBox.Show(form,
                        "无法写入该目录（通常需要管理员权限）：\n" + installDir +
                        "\n\n" + err +
                        "\n\n是否以管理员身份重新安装到此目录？\n选「否」可改用推荐的用户目录。",
                        DisplayName, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
                    if (elev == DialogResult.Yes)
                    {
                        try
                        {
                            Process.Start(new ProcessStartInfo
                            {
                                FileName = selfPath,
                                Arguments = "--dir=\"" + installDir + "\"",
                                UseShellExecute = true,
                                Verb = "runas"
                            });
                            form.Close();
                        }
                        catch (Exception elevEx)
                        {
                            MessageBox.Show(form, "未能提升权限：\n" + elevEx.Message +
                                "\n\n请改选用户可写目录，例如：\n" + GetDefaultInstallDir(selfDir),
                                DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                        }
                        return;
                    }
                    if (elev == DialogResult.No)
                    {
                        pathBox.Text = GetDefaultInstallDir(selfDir);
                        return;
                    }
                    return;
                }

                MessageBox.Show(form,
                    "无法写入该目录：\n" + installDir + "\n\n" + err +
                    "\n\n请选择磁盘上可写的文件夹（不要选 C:\\Program Files，除非以管理员安装）。\n推荐：\n" +
                    GetDefaultInstallDir(selfDir),
                    DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            pathBox.Enabled = false;
            browseBtn.Enabled = false;
            installBtn.Enabled = false;
            cancelBtn.Enabled = false;
            bar.Visible = true;
            status.Text = "正在安装，请稍候…";

            ThreadPool.QueueUserWorkItem(delegate
            {
                string exePath = null;
                string desktopLnk = null;
                Exception fail = null;
                try
                {
                    SetStatus(form, status, "正在读取安装包…");
                    string workRoot = CreateWorkDir(selfDir);
                    try
                    {
                        string zipPath = Path.Combine(workRoot, "app.zip");
                        ExtractPayload(selfPath, zipPath);

                        SetStatus(form, status, "正在写入文件…\n" + installDir);
                        PrepareInstallDir(installDir);
                        ExtractZipOverwriting(zipPath, installDir);

                        exePath = Path.Combine(installDir, ExeName);
                        if (!File.Exists(exePath))
                            throw new FileNotFoundException("安装包不完整，未找到主程序。", exePath);

                        string iconPath = Path.Combine(installDir, "icon.ico");
                        if (!File.Exists(iconPath)) iconPath = exePath;

                        SetStatus(form, status, "正在创建桌面快捷方式…");
                        desktopLnk = CreateDesktopShortcut(exePath, iconPath, installDir);
                        try { CreateStartMenuShortcuts(exePath, iconPath, installDir); } catch { }
                        CreateShortcut(Path.Combine(installDir, ShortcutName), exePath, iconPath, installDir);

                        try
                        {
                            string uninstaller = Path.Combine(installDir, "Uninstall DataFutureX-Note.exe");
                            WriteStubOnly(selfPath, uninstaller);
                            try { WriteUninstallRegistry(installDir, exePath, uninstaller, iconPath); } catch { }
                        }
                        catch { }

                        result = 0;
                    }
                    finally
                    {
                        SafeDeleteDir(workRoot);
                    }
                }
                catch (Exception ex)
                {
                    fail = ex;
                    result = 1;
                    try { WriteErrorLog(ex); } catch { }
                }

                string finalExe = exePath;
                string finalDir = installDir;
                string finalDesktop = desktopLnk;
                form.BeginInvoke(new MethodInvoker(delegate
                {
                    bar.Visible = false;
                    if (result == 0)
                    {
                        string tip = "安装完成！\n\n安装位置：\n" + finalDir;
                        if (!string.IsNullOrEmpty(finalDesktop) && File.Exists(finalDesktop))
                            tip += "\n\n已创建桌面快捷方式：DataFutureX Note";
                        else
                            tip += "\n\n（桌面快捷方式创建失败，仍可从安装目录启动）";
                        tip += "\n\n是否立即启动？";

                        var r = MessageBox.Show(form, tip, DisplayName,
                            MessageBoxButtons.YesNo, MessageBoxIcon.Information);
                        if (r == DialogResult.Yes)
                        {
                            try
                            {
                                Process.Start(new ProcessStartInfo
                                {
                                    FileName = finalExe,
                                    WorkingDirectory = finalDir,
                                    UseShellExecute = true
                                });
                            }
                            catch (Exception startEx)
                            {
                                MessageBox.Show(form, "启动失败：\n" + startEx.Message, DisplayName,
                                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                            }
                        }
                        form.Close();
                    }
                    else
                    {
                        pathBox.Enabled = true;
                        browseBtn.Enabled = true;
                        installBtn.Enabled = true;
                        cancelBtn.Enabled = true;
                        status.Text = "安装失败，可修改路径后重试。";
                        MessageBox.Show(form,
                            "安装失败：\n" + (fail != null ? fail.Message : "未知错误"),
                            DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }));
            });
        };

        Application.Run(form);
        return result;
    }

    private static void SetStatus(Form form, Label label, string text)
    {
        try
        {
            if (form.IsHandleCreated)
                form.BeginInvoke(new MethodInvoker(delegate { label.Text = text; }));
        }
        catch { }
    }

    private static string NormalizeInstallDir(string raw)
    {
        if (raw == null) return null;
        string p = raw.Trim().Trim('"').Trim();
        if (string.IsNullOrEmpty(p)) return null;
        p = Environment.ExpandEnvironmentVariables(p);
        p = p.Replace('/', '\\').TrimEnd('\\');
        // 允许用户只选父目录；若最后一段不是应用名则自动追加
        string name = Path.GetFileName(p);
        if (!string.Equals(name, AppFolderName, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(name, "DataFutureX Note", StringComparison.OrdinalIgnoreCase))
        {
            // 若路径已存在且是空/非空目录都可作为父目录追加；若用户明确写了完整自定义名则尊重
            // 这里：仅当路径看起来像“选择的父文件夹”时追加（浏览按钮已处理；手填时若不以应用名结尾则追加）
            if (!p.EndsWith(AppFolderName, StringComparison.OrdinalIgnoreCase))
                p = Path.Combine(p, AppFolderName);
        }
        return Path.GetFullPath(p);
    }

    private static bool IsProtectedSystemPath(string dir)
    {
        try
        {
            string full = Path.GetFullPath(dir).TrimEnd('\\') + "\\";
            string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            if (!string.IsNullOrEmpty(pf) && full.StartsWith(pf.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
                return true;
            if (!string.IsNullOrEmpty(pf86) && full.StartsWith(pf86.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
                return true;
            if (!string.IsNullOrEmpty(win) && full.StartsWith(win.TrimEnd('\\') + "\\", StringComparison.OrdinalIgnoreCase))
                return true;
        }
        catch { }
        return false;
    }

    private static string GetDefaultInstallDir(string selfDir)
    {
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local))
            local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if (!string.IsNullOrEmpty(local))
        {
            string p = Path.Combine(local, "Programs", AppFolderName);
            string err;
            if (CanWriteDir(p, out err)) return p;
            p = Path.Combine(local, AppFolderName);
            if (CanWriteDir(p, out err)) return p;
        }
        if (!string.IsNullOrEmpty(selfDir))
        {
            string p = Path.Combine(selfDir, AppFolderName);
            string err;
            if (CanWriteDir(p, out err)) return p;
        }
        string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (!string.IsNullOrEmpty(profile))
            return Path.Combine(profile, AppFolderName);
        return Path.Combine(@"D:\", AppFolderName);
    }

    private static string GetDesktopPath()
    {
        try
        {
            using (var key = Registry.CurrentUser.OpenSubKey(
                @"Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders"))
            {
                if (key != null)
                {
                    string v = key.GetValue("Desktop") as string;
                    if (!string.IsNullOrEmpty(v))
                    {
                        v = Environment.ExpandEnvironmentVariables(v);
                        if (Directory.Exists(v)) return v;
                    }
                }
            }
        }
        catch { }

        string[] candidates = new string[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory),
            Environment.GetFolderPath(Environment.SpecialFolder.Desktop),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) ?? "", "Desktop"),
            Path.Combine(Environment.GetEnvironmentVariable("USERPROFILE") ?? "", "Desktop")
        };
        foreach (string c in candidates)
        {
            if (!string.IsNullOrEmpty(c) && Directory.Exists(c))
                return c;
        }
        return null;
    }

    /// <summary>创建桌面快捷方式，返回 lnk 完整路径；失败返回 null。</summary>
    private static string CreateDesktopShortcut(string exePath, string iconPath, string installDir)
    {
        string desktop = GetDesktopPath();
        if (string.IsNullOrEmpty(desktop)) return null;

        string lnk = Path.Combine(desktop, DesktopShortcutName);
        // 清理旧中文名快捷方式，避免桌面残留两个入口
        try
        {
            string legacy = Path.Combine(desktop, "数字未来笔记.lnk");
            if (File.Exists(legacy)) File.Delete(legacy);
        }
        catch { }

        if (CreateShortcut(lnk, exePath, iconPath, installDir) && File.Exists(lnk))
            return lnk;

        // COM 失败时用临时 VBS 再试一次
        if (CreateShortcutViaVbs(lnk, exePath, iconPath, installDir) && File.Exists(lnk))
            return lnk;

        return null;
    }

    private static void CreateStartMenuShortcuts(string exePath, string iconPath, string installDir)
    {
        string sm = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
        if (string.IsNullOrEmpty(sm)) return;
        string programs = Path.Combine(sm, "Programs");
        if (!TryEnsureDir(programs)) return;
        CreateShortcut(Path.Combine(programs, ShortcutName), exePath, iconPath, installDir);
        string smDir = Path.Combine(programs, "DataFutureX");
        if (TryEnsureDir(smDir))
        {
            CreateShortcut(Path.Combine(smDir, ShortcutName), exePath, iconPath, installDir);
            CreateShortcut(Path.Combine(smDir, "DataFutureX Note.lnk"), exePath, iconPath, installDir);
        }
    }

    private static bool CreateShortcutViaVbs(string lnkPath, string target, string icon, string workDir)
    {
        string vbs = null;
        try
        {
            vbs = Path.Combine(Path.GetTempPath(), "dfx-shortcut-" + Guid.NewGuid().ToString("N") + ".vbs");
            string content =
                "Set o = CreateObject(\"WScript.Shell\")\r\n" +
                "Set s = o.CreateShortcut(\"" + EscapeVbs(lnkPath) + "\")\r\n" +
                "s.TargetPath = \"" + EscapeVbs(target) + "\"\r\n" +
                "s.WorkingDirectory = \"" + EscapeVbs(workDir) + "\"\r\n" +
                "s.IconLocation = \"" + EscapeVbs(icon) + "\"\r\n" +
                "s.Description = \"" + EscapeVbs(DisplayName) + "\"\r\n" +
                "s.Save\r\n";
            File.WriteAllText(vbs, content, Encoding.Default);
            var psi = new ProcessStartInfo
            {
                FileName = "wscript.exe",
                Arguments = "//nologo \"" + vbs + "\"",
                UseShellExecute = false,
                CreateNoWindow = true
            };
            using (var p = Process.Start(psi))
            {
                if (p != null) p.WaitForExit(8000);
            }
            return File.Exists(lnkPath);
        }
        catch
        {
            return false;
        }
        finally
        {
            try { if (vbs != null && File.Exists(vbs)) File.Delete(vbs); } catch { }
        }
    }

    private static string EscapeVbs(string s)
    {
        return (s ?? "").Replace("\"", "\"\"");
    }

    private static bool CanWriteDir(string dir, out string error)
    {
        error = null;
        try
        {
            if (string.IsNullOrEmpty(dir))
            {
                error = "路径为空";
                return false;
            }

            // 先确保父目录存在并可写
            string parent = Path.GetDirectoryName(dir.TrimEnd('\\'));
            if (!string.IsNullOrEmpty(parent) && !Directory.Exists(parent))
                Directory.CreateDirectory(parent);

            Directory.CreateDirectory(dir);
            string probe = Path.Combine(dir, ".__dfx_write_probe_" + Guid.NewGuid().ToString("N") + ".tmp");
            File.WriteAllBytes(probe, new byte[] { 1, 2, 3, 4 });
            File.Delete(probe);
            return true;
        }
        catch (Exception ex)
        {
            error = ex.Message;
            return false;
        }
    }

    private static void PrepareInstallDir(string installDir)
    {
        Directory.CreateDirectory(installDir);
        TryKillApp();
        try
        {
            foreach (string file in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
            {
                try
                {
                    File.SetAttributes(file, FileAttributes.Normal);
                    File.Delete(file);
                }
                catch { }
            }
            var dirs = new List<string>(Directory.GetDirectories(installDir, "*", SearchOption.AllDirectories));
            dirs.Sort(delegate(string a, string b) { return b.Length.CompareTo(a.Length); });
            foreach (string d in dirs)
            {
                try { Directory.Delete(d, false); } catch { }
            }
        }
        catch { }
    }

    private static void ExtractZipOverwriting(string zipPath, string installDir)
    {
        using (ZipArchive archive = ZipFile.OpenRead(zipPath))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string name = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                if (string.IsNullOrEmpty(name))
                    continue;

                if (name.EndsWith(Path.DirectorySeparatorChar.ToString()) || string.IsNullOrEmpty(entry.Name))
                {
                    Directory.CreateDirectory(Path.Combine(installDir, name));
                    continue;
                }

                string dest = Path.GetFullPath(Path.Combine(installDir, name));
                string root = Path.GetFullPath(installDir);
                if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("安装包含非法路径：" + entry.FullName);

                string parent = Path.GetDirectoryName(dest);
                if (!string.IsNullOrEmpty(parent))
                    Directory.CreateDirectory(parent);

                using (Stream src = entry.Open())
                using (FileStream dst = new FileStream(dest, FileMode.Create, FileAccess.Write, FileShare.None))
                {
                    src.CopyTo(dst);
                }
            }
        }
    }

    private static int Uninstall()
    {
        string installDir = null;
        try
        {
            using (var key = Registry.CurrentUser.OpenSubKey(UninstallKey))
            {
                if (key != null)
                    installDir = key.GetValue("InstallLocation") as string;
            }
        }
        catch { }

        if (string.IsNullOrEmpty(installDir) || !Directory.Exists(installDir))
        {
            string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            installDir = Path.Combine(local ?? "", "Programs", AppFolderName);
        }

        TryKillApp();
        string desktop = GetDesktopPath();
        if (!string.IsNullOrEmpty(desktop))
        {
            DeleteShortcut(Path.Combine(desktop, DesktopShortcutName));
            DeleteShortcut(Path.Combine(desktop, "数字未来笔记.lnk"));
        }
        string sm = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
        if (!string.IsNullOrEmpty(sm))
        {
            DeleteShortcut(Path.Combine(sm, "Programs", ShortcutName));
            DeleteShortcut(Path.Combine(sm, "Programs", "DataFutureX", ShortcutName));
            DeleteShortcut(Path.Combine(sm, "Programs", "DataFutureX", "DataFutureX Note.lnk"));
        }

        try
        {
            if (Directory.Exists(installDir))
            {
                foreach (string file in Directory.GetFiles(installDir, "*", SearchOption.AllDirectories))
                {
                    try { File.SetAttributes(file, FileAttributes.Normal); File.Delete(file); } catch { }
                }
                try { Directory.Delete(installDir, true); } catch { }
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show("卸载时无法完全删除：\n" + installDir + "\n" + ex.Message,
                DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }

        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
        MessageBox.Show("已卸载 " + DisplayName, DisplayName, MessageBoxButtons.OK, MessageBoxIcon.Information);
        return 0;
    }

    private static void WriteUninstallRegistry(string installDir, string exePath, string uninstaller, string iconPath)
    {
        using (var key = Registry.CurrentUser.CreateSubKey(UninstallKey))
        {
            key.SetValue("DisplayName", DisplayName);
            key.SetValue("DisplayIcon", iconPath);
            key.SetValue("InstallLocation", installDir);
            key.SetValue("Publisher", "DataFutureX");
            key.SetValue("UninstallString", "\"" + uninstaller + "\" /uninstall");
            key.SetValue("QuietUninstallString", "\"" + uninstaller + "\" /uninstall");
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
        }
    }

    private static bool TryEnsureDir(string dir)
    {
        try { Directory.CreateDirectory(dir); return Directory.Exists(dir); }
        catch { return false; }
    }

    private static bool CreateShortcut(string lnkPath, string target, string icon, string workDir)
    {
        try
        {
            string parent = Path.GetDirectoryName(lnkPath);
            if (!string.IsNullOrEmpty(parent) && !TryEnsureDir(parent))
                return false;

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return false;
            object shell = Activator.CreateInstance(shellType);
            object sc = shellType.InvokeMember(
                "CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { lnkPath });
            Type scType = sc.GetType();
            scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { workDir });
            scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { icon + ",0" });
            scType.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { DisplayName });
            scType.InvokeMember("WindowStyle", BindingFlags.SetProperty, null, sc, new object[] { 1 });
            scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
            return File.Exists(lnkPath);
        }
        catch
        {
            return false;
        }
    }

    private static void DeleteShortcut(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); } catch { }
    }

    private static void TryKillApp()
    {
        try
        {
            foreach (var p in Process.GetProcessesByName("DataFutureX Note"))
            {
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
        }
        catch { }
    }

    private static string CreateWorkDir(string selfDir)
    {
        var candidates = new List<string>();
        if (!string.IsNullOrEmpty(selfDir))
            candidates.Add(Path.Combine(selfDir, ".dfx-setup-tmp"));
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local))
            local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if (!string.IsNullOrEmpty(local))
            candidates.Add(Path.Combine(local, "DataFutureX-Note", ".setup-tmp"));
        candidates.Add(Path.Combine(Path.GetTempPath(), "DataFutureX-Note-setup-tmp"));

        foreach (string root in candidates)
        {
            try
            {
                string run = Path.Combine(root, "run-" + Guid.NewGuid().ToString("N"));
                Directory.CreateDirectory(run);
                string probe = Path.Combine(run, "probe.tmp");
                File.WriteAllText(probe, "ok", Encoding.ASCII);
                File.Delete(probe);
                return run;
            }
            catch { }
        }
        throw new IOException("无法创建临时目录，请把安装包拷到本地磁盘后重试。");
    }

    private static void SafeDeleteDir(string dir)
    {
        try { if (!string.IsNullOrEmpty(dir) && Directory.Exists(dir)) Directory.Delete(dir, true); } catch { }
    }

    private static void WriteStubOnly(string selfPath, string outPath)
    {
        byte[] marker = Encoding.ASCII.GetBytes(Marker);
        using (var fs = File.OpenRead(selfPath))
        {
            long markerPos = LastIndexOfMarker(fs, marker);
            if (markerPos <= 0) throw new InvalidDataException("无法生成卸载程序。");
            fs.Seek(0, SeekOrigin.Begin);
            using (var outFs = File.Create(outPath))
            {
                byte[] chunk = new byte[64 * 1024];
                long left = markerPos;
                while (left > 0)
                {
                    int n = fs.Read(chunk, 0, (int)Math.Min(chunk.Length, left));
                    if (n <= 0) break;
                    outFs.Write(chunk, 0, n);
                    left -= n;
                }
            }
        }
    }

    private static void ExtractPayload(string selfPath, string outPath)
    {
        byte[] marker = Encoding.ASCII.GetBytes(Marker);
        using (var fs = File.OpenRead(selfPath))
        {
            long markerPos = LastIndexOfMarker(fs, marker);
            if (markerPos < 0) throw new InvalidDataException("安装包数据缺失。");
            long payloadStart = markerPos + marker.Length;
            long payloadLen = fs.Length - payloadStart;
            if (payloadLen <= 0) throw new InvalidDataException("安装包数据为空。");
            fs.Seek(payloadStart, SeekOrigin.Begin);
            using (var outFs = File.Create(outPath))
            {
                byte[] chunk = new byte[1024 * 1024];
                long left = payloadLen;
                while (left > 0)
                {
                    int n = fs.Read(chunk, 0, (int)Math.Min(chunk.Length, left));
                    if (n <= 0) break;
                    outFs.Write(chunk, 0, n);
                    left -= n;
                }
            }
        }
        using (var z = File.OpenRead(outPath))
        {
            int b0 = z.ReadByte(), b1 = z.ReadByte();
            if (b0 != 'P' || b1 != 'K')
                throw new InvalidDataException("安装包损坏（不是有效 zip）。");
        }
    }

    private static long LastIndexOfMarker(FileStream fs, byte[] needle)
    {
        fs.Seek(0, SeekOrigin.Begin);
        long found = -1, pos = 0, start = -1;
        int match = 0, b;
        while ((b = fs.ReadByte()) >= 0)
        {
            if (b == needle[match])
            {
                if (match == 0) start = pos;
                match++;
                if (match == needle.Length) { found = start; match = 0; start = -1; }
            }
            else
            {
                match = 0; start = -1;
                if (b == needle[0]) { start = pos; match = 1; }
            }
            pos++;
        }
        return found;
    }

    private static void WriteErrorLog(Exception ex)
    {
        try
        {
            string dir = Path.GetDirectoryName(Process.GetCurrentProcess().MainModule.FileName) ?? Path.GetTempPath();
            File.WriteAllText(
                Path.Combine(dir, "DataFutureX-Note-install-error.log"),
                DateTime.Now + "\r\n" + ex + "\r\n",
                Encoding.UTF8);
        }
        catch { }
    }
}
