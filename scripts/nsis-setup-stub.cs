// 单文件安装引导：仅把 TEMP/TMP 指到隐藏可写目录，再运行内嵌 NSIS。
// 工作目录始终为安装包所在目录，避免安装向导默认进临时路径。
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Text;

internal static class Program
{
    private const string Marker = "DFX_NSIS_PAYLOAD_V1";

    private static int Main(string[] args)
    {
        string selfPath = Process.GetCurrentProcess().MainModule.FileName;
        string selfDir = Path.GetDirectoryName(selfPath) ?? Environment.CurrentDirectory;
        string workDir = null;
        try
        {
            workDir = CreateWorkDir(selfPath);
            Environment.SetEnvironmentVariable("TEMP", workDir);
            Environment.SetEnvironmentVariable("TMP", workDir);

            string payloadPath = Path.Combine(workDir, "setup-payload.exe");
            ExtractPayload(selfPath, payloadPath);

            var psi = new ProcessStartInfo
            {
                FileName = payloadPath,
                // 关键：不要用临时目录当 CWD，否则安装路径浏览会从异常目录开始
                WorkingDirectory = selfDir,
                UseShellExecute = false
            };
            if (args != null && args.Length > 0)
                psi.Arguments = EscapeArgs(args);

            using (var p = Process.Start(psi))
            {
                if (p == null) return 1;
                p.WaitForExit();
                return p.ExitCode;
            }
        }
        catch (Exception ex)
        {
            try { Console.Error.WriteLine(ex.ToString()); } catch { }
            return 1;
        }
        finally
        {
            SafeDeleteDir(workDir);
        }
    }

    private static string EscapeArgs(string[] args)
    {
        var sb = new StringBuilder();
        for (int i = 0; i < args.Length; i++)
        {
            if (i > 0) sb.Append(' ');
            string a = args[i] ?? "";
            if (a.Length == 0) { sb.Append("\"\""); continue; }
            if (a.IndexOfAny(new[] { ' ', '\t', '"' }) < 0) { sb.Append(a); continue; }
            sb.Append('"');
            sb.Append(a.Replace("\"", "\\\""));
            sb.Append('"');
        }
        return sb.ToString();
    }

    private static string CreateWorkDir(string selfPath)
    {
        foreach (string root in CandidateRoots(selfPath))
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
        throw new IOException("No writable temporary directory for installer.");
    }

    private static IEnumerable<string> CandidateRoots(string selfPath)
    {
        var list = new List<string>();

        // 优先：用户本地应用数据下的隐藏目录（不出现在盘符根目录）
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        if (!string.IsNullOrEmpty(local))
            list.Add(Path.Combine(local, "DataFutureX-Note", ".setup-tmp"));

        try
        {
            list.Add(Path.Combine(Path.GetDirectoryName(selfPath) ?? ".", ".dfx-setup-tmp"));
        }
        catch { }

        list.Add(Path.Combine(Path.GetTempPath(), "DataFutureX-Note-setup-tmp"));
        return list;
    }

    private static void SafeDeleteDir(string dir)
    {
        if (string.IsNullOrEmpty(dir)) return;
        try
        {
            if (Directory.Exists(dir))
                Directory.Delete(dir, true);
        }
        catch { }

        // 顺带清理空的父级 .setup-tmp
        try
        {
            string parent = Path.GetDirectoryName(dir);
            if (!string.IsNullOrEmpty(parent) &&
                (parent.EndsWith(".setup-tmp", StringComparison.OrdinalIgnoreCase) ||
                 parent.EndsWith("DataFutureX-Note-setup-tmp", StringComparison.OrdinalIgnoreCase)) &&
                Directory.Exists(parent) &&
                Directory.GetFileSystemEntries(parent).Length == 0)
            {
                Directory.Delete(parent, false);
            }
        }
        catch { }
    }

    private static void ExtractPayload(string selfPath, string outPath)
    {
        byte[] marker = Encoding.ASCII.GetBytes(Marker);
        using (var fs = File.OpenRead(selfPath))
        {
            long len = fs.Length;
            if (len < marker.Length + 8)
                throw new InvalidDataException("Installer payload missing.");

            long markerPos = LastIndexOfMarker(fs, marker);
            if (markerPos < 0)
                throw new InvalidDataException("Installer payload marker not found.");

            long payloadStart = markerPos + marker.Length;
            long payloadLen = len - payloadStart;
            if (payloadLen <= 0)
                throw new InvalidDataException("Installer payload empty.");

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
    }

    private static long LastIndexOfMarker(FileStream fs, byte[] needle)
    {
        long len = fs.Length;
        if (len < needle.Length) return -1;

        fs.Seek(0, SeekOrigin.Begin);
        long found = -1;
        long pos = 0;
        int match = 0;
        long start = -1;
        int b;
        while ((b = fs.ReadByte()) >= 0)
        {
            if (b == needle[match])
            {
                if (match == 0) start = pos;
                match++;
                if (match == needle.Length)
                {
                    found = start;
                    match = 0;
                    start = -1;
                }
            }
            else
            {
                match = 0;
                start = -1;
                if (b == needle[0])
                {
                    start = pos;
                    match = 1;
                }
            }
            pos++;
        }
        return found;
    }
}
