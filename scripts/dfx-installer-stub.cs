// DataFutureX Note 单文件安装器（不使用 NSIS）
// 布局：stub.exe + marker + zip(win-unpacked 内容)
// 界面：① 路径选择 → ② 安装进度 → ③ 完成并启动
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
    private const string BrandTitle = "DataFutureX 数字未来笔记";
    private const string DisplayName = "DataFutureX Note（数字未来笔记）";
    private const string ShortcutName = "DataFutureX Note.lnk";
    private const string DesktopShortcutName = "DataFutureX Note.lnk";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\DataFutureX-Note";
    private const string LogoResourceName = "DfxInstaller.Logo.png";

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
                MessageBox.Show("安装失败：\n" + ex.Message, BrandTitle,
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
        string defaultDir = ResolveInitialInstallDir(presetDir, selfDir);
        bool isUpgrade = LooksLikeInstallDir(defaultDir);

        Image logoImage = LoadBrandLogo();
        Icon formIcon = null;
        try { formIcon = Icon.ExtractAssociatedIcon(selfPath); } catch { }

        var form = new Form
        {
            Text = BrandTitle + " 安装",
            Width = 580,
            Height = 420,
            FormBorderStyle = FormBorderStyle.FixedDialog,
            MaximizeBox = false,
            MinimizeBox = false,
            StartPosition = FormStartPosition.CenterScreen,
            ShowInTaskbar = true,
            BackColor = Color.White,
            Font = SystemFonts.MessageBoxFont
        };
        if (formIcon != null) form.Icon = formIcon;

        // —— 顶部品牌区（三页共用）——
        var header = new Panel
        {
            Left = 0, Top = 0, Width = 580, Height = 88,
            BackColor = Color.FromArgb(248, 250, 252)
        };
        var logoBox = new PictureBox
        {
            Left = 24, Top = 18, Width = 52, Height = 52,
            SizeMode = PictureBoxSizeMode.Zoom,
            BackColor = Color.Transparent
        };
        if (logoImage != null) logoBox.Image = logoImage;
        var brandLabel = new Label
        {
            Left = 90, Top = 22, Width = 450, Height = 28,
            Text = BrandTitle,
            Font = new Font("Microsoft YaHei UI", 14f, FontStyle.Bold),
            ForeColor = Color.FromArgb(15, 23, 42),
            BackColor = Color.Transparent
        };
        var brandSub = new Label
        {
            Left = 90, Top = 52, Width = 450, Height = 22,
            Text = isUpgrade ? "检测到已安装版本，将覆盖安装到原目录" : "本地优先的桌面 Markdown 笔记",
            ForeColor = Color.FromArgb(100, 116, 139),
            BackColor = Color.Transparent
        };
        header.Controls.Add(logoBox);
        header.Controls.Add(brandLabel);
        header.Controls.Add(brandSub);

        // —— 第 1 页：安装路径 ——
        var pagePath = new Panel
        {
            Left = 0, Top = 88, Width = 580, Height = 300,
            BackColor = Color.White
        };
        var pathTitle = new Label
        {
            Left = 28, Top = 20, Width = 520, Height = 24,
            Text = "① 选择安装路径",
            Font = new Font("Microsoft YaHei UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 41, 59)
        };
        var pathHint = new Label
        {
            Left = 28, Top = 48, Width = 520, Height = 36,
            Text = isUpgrade
                ? "已自动填入原安装目录。确认无误后点击「确认安装」。"
                : "请选择安装目录，然后点击「确认安装」。",
            ForeColor = Color.FromArgb(71, 85, 105)
        };
        var pathBox = new TextBox
        {
            Left = 28, Top = 96, Width = 400, Height = 26,
            Text = defaultDir,
            Font = new Font("Consolas", 9.5f)
        };
        var browseBtn = new Button
        {
            Left = 438, Top = 94, Width = 100, Height = 30,
            Text = "浏览…",
            FlatStyle = FlatStyle.System
        };
        var pathTip = new Label
        {
            Left = 28, Top = 136, Width = 520, Height = 40,
            Text = "推荐路径：%LOCALAPPDATA%\\Programs\\DataFutureX-Note\n覆盖安装时请保持原目录，以免桌面快捷方式失效。",
            ForeColor = Color.FromArgb(148, 163, 184)
        };
        var confirmBtn = new Button
        {
            Left = 300, Top = 220, Width = 120, Height = 36,
            Text = "确认安装",
            FlatStyle = FlatStyle.System,
            Font = new Font("Microsoft YaHei UI", 10f, FontStyle.Bold)
        };
        var cancelBtn = new Button
        {
            Left = 432, Top = 220, Width = 100, Height = 36,
            Text = "取消",
            FlatStyle = FlatStyle.System
        };
        pagePath.Controls.Add(pathTitle);
        pagePath.Controls.Add(pathHint);
        pagePath.Controls.Add(pathBox);
        pagePath.Controls.Add(browseBtn);
        pagePath.Controls.Add(pathTip);
        pagePath.Controls.Add(confirmBtn);
        pagePath.Controls.Add(cancelBtn);

        // —— 第 2 页：安装进度 ——
        var pageProgress = new Panel
        {
            Left = 0, Top = 88, Width = 580, Height = 300,
            BackColor = Color.White,
            Visible = false
        };
        var progTitle = new Label
        {
            Left = 28, Top = 20, Width = 520, Height = 24,
            Text = "② 正在安装",
            Font = new Font("Microsoft YaHei UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(30, 41, 59)
        };
        var progStatus = new Label
        {
            Left = 28, Top = 60, Width = 520, Height = 48,
            Text = "准备中…",
            ForeColor = Color.FromArgb(51, 65, 85)
        };
        var bar = new ProgressBar
        {
            Left = 28, Top = 120, Width = 510, Height = 24,
            Minimum = 0,
            Maximum = 100,
            Value = 0,
            Style = ProgressBarStyle.Continuous
        };
        var progPercent = new Label
        {
            Left = 28, Top = 156, Width = 520, Height = 22,
            Text = "0%",
            ForeColor = Color.FromArgb(100, 116, 139)
        };
        pageProgress.Controls.Add(progTitle);
        pageProgress.Controls.Add(progStatus);
        pageProgress.Controls.Add(bar);
        pageProgress.Controls.Add(progPercent);

        // —— 第 3 页：完成 ——
        var pageDone = new Panel
        {
            Left = 0, Top = 88, Width = 580, Height = 300,
            BackColor = Color.White,
            Visible = false
        };
        var doneTitle = new Label
        {
            Left = 28, Top = 24, Width = 520, Height = 28,
            Text = "③ 安装完成",
            Font = new Font("Microsoft YaHei UI", 11f, FontStyle.Bold),
            ForeColor = Color.FromArgb(22, 163, 74)
        };
        var doneMsg = new Label
        {
            Left = 28, Top = 64, Width = 520, Height = 80,
            Text = "",
            ForeColor = Color.FromArgb(51, 65, 85)
        };
        var launchBtn = new Button
        {
            Left = 280, Top = 220, Width = 140, Height = 40,
            Text = "启动",
            FlatStyle = FlatStyle.System,
            Font = new Font("Microsoft YaHei UI", 11f, FontStyle.Bold)
        };
        var finishBtn = new Button
        {
            Left = 432, Top = 220, Width = 100, Height = 40,
            Text = "完成",
            FlatStyle = FlatStyle.System
        };
        pageDone.Controls.Add(doneTitle);
        pageDone.Controls.Add(doneMsg);
        pageDone.Controls.Add(launchBtn);
        pageDone.Controls.Add(finishBtn);

        form.Controls.Add(header);
        form.Controls.Add(pagePath);
        form.Controls.Add(pageProgress);
        form.Controls.Add(pageDone);
        form.AcceptButton = confirmBtn;
        form.CancelButton = cancelBtn;

        string installedExe = null;
        string installedDir = null;
        int result = 1;

        Action showPath = delegate
        {
            pagePath.Visible = true;
            pageProgress.Visible = false;
            pageDone.Visible = false;
            form.AcceptButton = confirmBtn;
            form.CancelButton = cancelBtn;
        };
        Action showProgress = delegate
        {
            pagePath.Visible = false;
            pageProgress.Visible = true;
            pageDone.Visible = false;
            form.AcceptButton = null;
            form.CancelButton = null;
        };
        Action showDone = delegate
        {
            pagePath.Visible = false;
            pageProgress.Visible = false;
            pageDone.Visible = true;
            form.AcceptButton = launchBtn;
            form.CancelButton = finishBtn;
        };

        // 管理员提权重进且路径可写：直接进入安装
        bool autoStart = !string.IsNullOrEmpty(presetDir);
        form.Shown += delegate
        {
            if (!autoStart) return;
            string err;
            if (CanWriteDir(pathBox.Text.Trim(), out err))
                confirmBtn.PerformClick();
            else
                pathHint.Text = "已请求管理员权限，但仍无法写入，请更换路径。\n" + err;
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
        finishBtn.Click += delegate { form.Close(); };

        launchBtn.Click += delegate
        {
            if (string.IsNullOrEmpty(installedExe) || !File.Exists(installedExe))
            {
                MessageBox.Show(form, "未找到主程序，请从桌面快捷方式或开始菜单启动。", BrandTitle,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = installedExe,
                    WorkingDirectory = installedDir ?? Path.GetDirectoryName(installedExe),
                    UseShellExecute = true
                });
                form.Close();
            }
            catch (Exception startEx)
            {
                MessageBox.Show(form, "启动失败：\n" + startEx.Message, BrandTitle,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        };

        confirmBtn.Click += delegate
        {
            string installDir;
            try
            {
                installDir = NormalizeInstallDir(pathBox.Text);
            }
            catch (Exception pathEx)
            {
                MessageBox.Show(form, "安装路径无效：\n" + pathEx.Message, BrandTitle,
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }
            if (string.IsNullOrEmpty(installDir))
            {
                MessageBox.Show(form, "请填写安装路径。", BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                        BrandTitle, MessageBoxButtons.YesNoCancel, MessageBoxIcon.Warning);
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
                                BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
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
                    BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
                return;
            }

            showProgress();
            SetProgress(form, bar, progPercent, 0);
            SetStatus(form, progStatus, "正在读取安装包…");

            ThreadPool.QueueUserWorkItem(delegate
            {
                string exePath = null;
                string desktopLnk = null;
                Exception fail = null;
                try
                {
                    SetStatus(form, progStatus, "正在读取安装包…");
                    SetProgress(form, bar, progPercent, 5);
                    string workRoot = CreateWorkDir(selfDir);
                    try
                    {
                        string zipPath = Path.Combine(workRoot, "app.zip");
                        ExtractPayload(selfPath, zipPath);
                        SetProgress(form, bar, progPercent, 20);

                        SetStatus(form, progStatus, "正在清理并写入文件…\n" + installDir);
                        PrepareInstallDir(installDir);
                        SetProgress(form, bar, progPercent, 30);

                        ExtractZipOverwriting(zipPath, installDir, delegate(int percent)
                        {
                            // 30% ~ 85% 映射解压进度
                            int mapped = 30 + (int)(percent * 0.55);
                            SetProgress(form, bar, progPercent, mapped);
                            SetStatus(form, progStatus, "正在写入文件… " + percent + "%\n" + installDir);
                        });

                        exePath = Path.Combine(installDir, ExeName);
                        if (!File.Exists(exePath))
                            throw new FileNotFoundException("安装包不完整，未找到主程序。", exePath);

                        // 快捷方式优先指向已嵌入 Logo 的主程序；旁路 icon.ico 作卸载显示备用
                        string sideIco = Path.Combine(installDir, "icon.ico");
                        string iconPath = File.Exists(exePath) ? exePath : sideIco;
                        if (string.IsNullOrEmpty(iconPath) || !File.Exists(iconPath)) iconPath = sideIco;

                        SetProgress(form, bar, progPercent, 90);
                        SetStatus(form, progStatus, "正在创建桌面快捷方式…");
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

                        SetProgress(form, bar, progPercent, 100);
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
                    if (result == 0)
                    {
                        installedExe = finalExe;
                        installedDir = finalDir;
                        string tip = "已成功安装到：\n" + finalDir;
                        if (!string.IsNullOrEmpty(finalDesktop) && File.Exists(finalDesktop))
                            tip += "\n\n已创建桌面快捷方式：DataFutureX Note";
                        else
                            tip += "\n\n（桌面快捷方式创建失败，仍可从下方按钮或安装目录启动）";
                        tip += "\n\n点击「启动」即可打开 " + BrandTitle + "。";
                        doneMsg.Text = tip;
                        showDone();
                    }
                    else
                    {
                        showPath();
                        pathHint.Text = "安装失败，可修改路径后重试。";
                        MessageBox.Show(form,
                            "安装失败：\n" + (fail != null ? fail.Message : "未知错误"),
                            BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Error);
                    }
                }));
            });
        };

        Application.Run(form);
        if (logoImage != null) try { logoImage.Dispose(); } catch { }
        if (formIcon != null) try { formIcon.Dispose(); } catch { }
        return result;
    }

    private static Image LoadBrandLogo()
    {
        try
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream s = asm.GetManifestResourceStream(LogoResourceName))
            {
                if (s != null) return Image.FromStream(s);
            }
        }
        catch { }

        try
        {
            string self = Process.GetCurrentProcess().MainModule.FileName;
            using (Icon ico = Icon.ExtractAssociatedIcon(self))
            {
                if (ico != null) return new Bitmap(ico.ToBitmap(), 52, 52);
            }
        }
        catch { }
        return null;
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

    private static void SetProgress(Form form, ProgressBar bar, Label percentLabel, int value)
    {
        if (value < 0) value = 0;
        if (value > 100) value = 100;
        try
        {
            if (form.IsHandleCreated)
            {
                form.BeginInvoke(new MethodInvoker(delegate
                {
                    bar.Value = value;
                    percentLabel.Text = value + "%";
                }));
            }
        }
        catch { }
    }

    /// <summary>优先使用命令行路径；否则查找已安装目录（覆盖安装）；再回退默认路径。</summary>
    private static string ResolveInitialInstallDir(string presetDir, string selfDir)
    {
        if (!string.IsNullOrEmpty(presetDir))
            return NormalizeInstallDir(presetDir);

        string existing = FindExistingInstallDir();
        if (!string.IsNullOrEmpty(existing))
            return existing;

        return GetDefaultInstallDir(selfDir);
    }

    /// <summary>从注册表 / 常见路径定位原安装目录。</summary>
    private static string FindExistingInstallDir()
    {
        foreach (string candidate in EnumerateExistingInstallCandidates())
        {
            if (LooksLikeInstallDir(candidate))
                return Path.GetFullPath(candidate.TrimEnd('\\'));
        }
        return null;
    }

    private static IEnumerable<string> EnumerateExistingInstallCandidates()
    {
        string fromReg = ReadInstallLocationFromRegistry(Registry.CurrentUser);
        if (!string.IsNullOrEmpty(fromReg)) yield return fromReg;

        fromReg = ReadInstallLocationFromRegistry(Registry.LocalMachine);
        if (!string.IsNullOrEmpty(fromReg)) yield return fromReg;

        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local))
            local = Environment.GetEnvironmentVariable("LOCALAPPDATA");
        if (!string.IsNullOrEmpty(local))
        {
            yield return Path.Combine(local, "Programs", AppFolderName);
            yield return Path.Combine(local, AppFolderName);
        }

        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (!string.IsNullOrEmpty(pf))
            yield return Path.Combine(pf, AppFolderName);

        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        if (!string.IsNullOrEmpty(pf86))
            yield return Path.Combine(pf86, AppFolderName);
    }

    private static string ReadInstallLocationFromRegistry(RegistryKey root)
    {
        try
        {
            using (RegistryKey key = root.OpenSubKey(UninstallKey))
            {
                if (key == null) return null;
                string loc = key.GetValue("InstallLocation") as string;
                if (string.IsNullOrEmpty(loc)) return null;
                return Environment.ExpandEnvironmentVariables(loc.Trim().Trim('"'));
            }
        }
        catch
        {
            return null;
        }
    }

    private static bool LooksLikeInstallDir(string dir)
    {
        try
        {
            if (string.IsNullOrEmpty(dir) || !Directory.Exists(dir)) return false;
            return File.Exists(Path.Combine(dir, ExeName));
        }
        catch
        {
            return false;
        }
    }

    private static string NormalizeInstallDir(string raw)
    {
        if (raw == null) return null;
        string p = raw.Trim().Trim('"').Trim();
        if (string.IsNullOrEmpty(p)) return null;
        p = Environment.ExpandEnvironmentVariables(p);
        p = p.Replace('/', '\\').TrimEnd('\\');
        string name = Path.GetFileName(p);
        if (!string.Equals(name, AppFolderName, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(name, "DataFutureX Note", StringComparison.OrdinalIgnoreCase))
        {
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

    private static string CreateDesktopShortcut(string exePath, string iconPath, string installDir)
    {
        string desktop = GetDesktopPath();
        if (string.IsNullOrEmpty(desktop)) return null;

        string lnk = Path.Combine(desktop, DesktopShortcutName);
        try
        {
            string legacy = Path.Combine(desktop, "数字未来笔记.lnk");
            if (File.Exists(legacy)) File.Delete(legacy);
        }
        catch { }

        if (CreateShortcut(lnk, exePath, iconPath, installDir) && File.Exists(lnk))
            return lnk;

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
                "s.Description = \"" + EscapeVbs(BrandTitle) + "\"\r\n" +
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

    private static void ExtractZipOverwriting(string zipPath, string installDir, Action<int> onProgress)
    {
        using (ZipArchive archive = ZipFile.OpenRead(zipPath))
        {
            int total = 0;
            foreach (ZipArchiveEntry e in archive.Entries)
            {
                if (!string.IsNullOrEmpty(e.Name)) total++;
            }
            if (total <= 0) total = 1;

            int done = 0;
            int lastPct = -1;
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

                done++;
                int pct = (int)((done * 100L) / total);
                if (pct != lastPct && onProgress != null)
                {
                    lastPct = pct;
                    onProgress(pct);
                }
            }
            if (onProgress != null) onProgress(100);
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
                BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }

        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
        MessageBox.Show("已卸载 " + BrandTitle, BrandTitle, MessageBoxButtons.OK, MessageBoxIcon.Information);
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
            scType.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { BrandTitle });
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
