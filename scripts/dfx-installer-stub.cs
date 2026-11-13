// DataFutureX Note 单文件安装器（不使用 NSIS）
// 布局：stub.exe + marker + zip(win-unpacked 内容)
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    private const string Marker = "DFX_APP_PAYLOAD_V1";
    private const string AppFolderName = "DataFutureX-Note";
    private const string ExeName = "DataFutureX Note.exe";
    private const string DisplayName = "DataFutureX Note（数字未来笔记）";
    private const string UninstallKey = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\DataFutureX-Note";

    [STAThread]
    private static int Main(string[] args)
    {
        try
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            if (args != null)
            {
                foreach (string a in args)
                {
                    if (string.Equals(a, "/S", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a, "/silent", StringComparison.OrdinalIgnoreCase))
                        continue;
                    if (string.Equals(a, "/uninstall", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(a, "--uninstall", StringComparison.OrdinalIgnoreCase))
                        return Uninstall();
                }
            }

            return Install();
        }
        catch (Exception ex)
        {
            try
            {
                WriteErrorLog(ex);
                MessageBox.Show("安装失败：\n" + ex.Message, "DataFutureX Note",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            catch { }
            return 1;
        }
    }

    private static int Install()
    {
        string selfPath = Process.GetCurrentProcess().MainModule.FileName;
        string selfDir = Path.GetDirectoryName(selfPath) ?? Environment.CurrentDirectory;

        string installDir = ChooseInstallDir(selfPath, selfDir);
        string workRoot = CreateWorkDir(selfDir);
        try
        {
            string zipPath = Path.Combine(workRoot, "app.zip");
            ExtractPayload(selfPath, zipPath);

            PrepareInstallDir(installDir);
            ExtractZipOverwriting(zipPath, installDir);

            string exePath = Path.Combine(installDir, ExeName);
            if (!File.Exists(exePath))
                throw new FileNotFoundException("安装包不完整，未找到主程序。\n目标：" + installDir, exePath);

            string iconPath = Path.Combine(installDir, "icon.ico");
            if (!File.Exists(iconPath))
                iconPath = exePath;

            // 快捷方式失败不得导致安装失败（部分环境开始菜单目录只读）
            try { CreateShortcuts(exePath, iconPath, installDir, selfDir); }
            catch (Exception scEx) { try { WriteErrorLog(scEx); } catch { } }

            string uninstaller = Path.Combine(installDir, "Uninstall DataFutureX-Note.exe");
            WriteStubOnly(selfPath, uninstaller);
            try { WriteUninstallRegistry(installDir, exePath, uninstaller, iconPath); }
            catch (Exception regEx) { try { WriteErrorLog(regEx); } catch { } }

            try
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = exePath,
                    WorkingDirectory = installDir,
                    UseShellExecute = true
                });
            }
            catch { }

            return 0;
        }
        finally
        {
            SafeDeleteDir(workRoot);
        }
    }

    private static string ChooseInstallDir(string selfPath, string selfDir)
    {
        var tried = new List<string>();
        foreach (string dir in InstallCandidates(selfDir))
        {
            tried.Add(dir);
            string err;
            if (CanWriteDir(dir, out err))
                return dir;
        }

        // 最后让用户手动选父目录
        using (var dlg = new FolderBrowserDialog())
        {
            dlg.Description = "自动安装目录不可写，请选择一个可写文件夹（将在其中创建 DataFutureX-Note）";
            dlg.SelectedPath = Directory.Exists(selfDir) ? selfDir : @"C:\";
            if (dlg.ShowDialog() == DialogResult.OK && !string.IsNullOrEmpty(dlg.SelectedPath))
            {
                string dir = Path.Combine(dlg.SelectedPath, AppFolderName);
                tried.Add(dir);
                string err;
                if (CanWriteDir(dir, out err))
                    return dir;
            }
        }

        throw new IOException(
            "无法创建安装目录。\n已尝试：\n- " + string.Join("\n- ", tried.ToArray()) +
            "\n\n请把安装包拷到本地磁盘（如 D:\\）后重试，或选择其他可写目录。");
    }

    private static IEnumerable<string> InstallCandidates(string selfDir)
    {
        var list = new List<string>();
        Action<string> add = delegate(string p)
        {
            if (string.IsNullOrEmpty(p)) return;
            try
            {
                p = Path.GetFullPath(p);
                if (!list.Exists(delegate(string x) { return string.Equals(x, p, StringComparison.OrdinalIgnoreCase); }))
                    list.Add(p);
            }
            catch { }
        };

        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (string.IsNullOrEmpty(local))
            local = Environment.GetEnvironmentVariable("LOCALAPPDATA");

        if (!string.IsNullOrEmpty(local))
        {
            add(Path.Combine(local, "Programs", AppFolderName));
            add(Path.Combine(local, AppFolderName));
        }

        // 安装包旁边（通常最可写）
        if (!string.IsNullOrEmpty(selfDir))
            add(Path.Combine(selfDir, AppFolderName));

        string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (string.IsNullOrEmpty(profile))
            profile = Environment.GetEnvironmentVariable("USERPROFILE");
        if (!string.IsNullOrEmpty(profile))
            add(Path.Combine(profile, AppFolderName));

        string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (!string.IsNullOrEmpty(desktop))
            add(Path.Combine(desktop, AppFolderName));

        // 非系统盘根下的 Programs（避免直接写 C:\Programs）
        try
        {
            if (!string.IsNullOrEmpty(selfDir))
            {
                string root = Path.GetPathRoot(Path.GetFullPath(selfDir));
                if (!string.IsNullOrEmpty(root) &&
                    !root.TrimEnd('\\').Equals("C:", StringComparison.OrdinalIgnoreCase))
                {
                    add(Path.Combine(root, "Programs", AppFolderName));
                }
            }
        }
        catch { }

        return list;
    }

    private static bool CanWriteDir(string dir, out string error)
    {
        error = null;
        try
        {
            Directory.CreateDirectory(dir);
            string probe = Path.Combine(dir, ".__dfx_write_probe_" + Guid.NewGuid().ToString("N"));
            using (var fs = new FileStream(probe, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                byte[] data = Encoding.ASCII.GetBytes("ok");
                fs.Write(data, 0, data.Length);
            }
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

        // 不整体 Delete（易被占用失败）；清空可删文件，保留目录
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
            // 从深到浅删空目录
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
        // .NET Framework ZipFile.ExtractToDirectory 不覆盖；手动解压
        using (ZipArchive archive = ZipFile.OpenRead(zipPath))
        {
            foreach (ZipArchiveEntry entry in archive.Entries)
            {
                string name = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                if (string.IsNullOrEmpty(name) || name.EndsWith(Path.DirectorySeparatorChar.ToString()))
                {
                    Directory.CreateDirectory(Path.Combine(installDir, name));
                    continue;
                }

                // 防 zip-slip
                string dest = Path.GetFullPath(Path.Combine(installDir, name));
                string root = Path.GetFullPath(installDir);
                if (!dest.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("安装包含非法路径：" + entry.FullName);

                string parent = Path.GetDirectoryName(dest);
                if (!string.IsNullOrEmpty(parent))
                    Directory.CreateDirectory(parent);

                if (string.IsNullOrEmpty(entry.Name))
                    continue;

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
        DeleteShortcut(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "数字未来笔记.lnk"));
        string sm = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
        if (!string.IsNullOrEmpty(sm))
        {
            DeleteShortcut(Path.Combine(sm, "Programs", "数字未来笔记.lnk"));
            DeleteShortcut(Path.Combine(sm, "Programs", "DataFutureX", "数字未来笔记.lnk"));
            DeleteShortcut(Path.Combine(sm, "Programs", "DataFutureX", "DataFutureX Note.lnk"));
            try
            {
                string smDir = Path.Combine(sm, "Programs", "DataFutureX");
                if (Directory.Exists(smDir) && Directory.GetFileSystemEntries(smDir).Length == 0)
                    Directory.Delete(smDir, false);
            }
            catch { }
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
                "DataFutureX Note", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return 1;
        }

        try { Registry.CurrentUser.DeleteSubKeyTree(UninstallKey, false); } catch { }
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
            string uninstallCmd = uninstaller.EndsWith(".cmd", StringComparison.OrdinalIgnoreCase)
                ? "\"" + uninstaller + "\""
                : "\"" + uninstaller + "\" /uninstall";
            key.SetValue("UninstallString", uninstallCmd);
            key.SetValue("QuietUninstallString", uninstallCmd);
            key.SetValue("NoModify", 1, RegistryValueKind.DWord);
            key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
            try
            {
                long size = DirSize(new DirectoryInfo(installDir)) / 1024L;
                key.SetValue("EstimatedSize", checked((int)Math.Min(size, int.MaxValue)), RegistryValueKind.DWord);
            }
            catch { }
        }
    }

    private static long DirSize(DirectoryInfo d)
    {
        long size = 0;
        foreach (var f in d.GetFiles()) size += f.Length;
        foreach (var sub in d.GetDirectories()) size += DirSize(sub);
        return size;
    }

    private static void CreateShortcuts(string exePath, string iconPath, string installDir, string selfDir)
    {
        // 1) 安装目录内启动快捷方式（几乎总能写）
        CreateShortcut(Path.Combine(installDir, "数字未来笔记.lnk"), exePath, iconPath, installDir);

        // 2) 桌面
        try
        {
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            if (!string.IsNullOrEmpty(desktop))
                CreateShortcut(Path.Combine(desktop, "数字未来笔记.lnk"), exePath, iconPath, installDir);
        }
        catch { }

        // 3) 开始菜单（可能被策略/沙箱设为只读，失败忽略）
        try
        {
            string sm = Environment.GetFolderPath(Environment.SpecialFolder.StartMenu);
            if (string.IsNullOrEmpty(sm))
            {
                string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile) ?? selfDir;
                sm = Path.Combine(profile, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu");
            }
            string programs = Path.Combine(sm, "Programs");
            if (TryEnsureDir(programs))
            {
                CreateShortcut(Path.Combine(programs, "数字未来笔记.lnk"), exePath, iconPath, installDir);
                string smDir = Path.Combine(programs, "DataFutureX");
                if (TryEnsureDir(smDir))
                {
                    CreateShortcut(Path.Combine(smDir, "数字未来笔记.lnk"), exePath, iconPath, installDir);
                    CreateShortcut(Path.Combine(smDir, "DataFutureX Note.lnk"), exePath, iconPath, installDir);
                }
            }
        }
        catch { }
    }

    private static bool TryEnsureDir(string dir)
    {
        try { Directory.CreateDirectory(dir); return Directory.Exists(dir); }
        catch { return false; }
    }

    private static void CreateShortcut(string lnkPath, string target, string icon, string workDir)
    {
        try
        {
            string parent = Path.GetDirectoryName(lnkPath);
            if (!string.IsNullOrEmpty(parent) && !TryEnsureDir(parent))
                return;

            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            object shell = Activator.CreateInstance(shellType);
            object sc = shellType.InvokeMember(
                "CreateShortcut",
                BindingFlags.InvokeMethod,
                null, shell, new object[] { lnkPath });
            Type scType = sc.GetType();
            scType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, sc, new object[] { target });
            scType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, sc, new object[] { workDir });
            scType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, sc, new object[] { icon });
            scType.InvokeMember("Description", BindingFlags.SetProperty, null, sc, new object[] { DisplayName });
            scType.InvokeMember("Save", BindingFlags.InvokeMethod, null, sc, null);
        }
        catch { }
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
