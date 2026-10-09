using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

class Launcher {
    const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    static extern IntPtr CreateJobObject(IntPtr attributes, string name);

    [DllImport("kernel32.dll")]
    static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint length);

    [DllImport("kernel32.dll")]
    static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr handle);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    static extern int MessageBox(IntPtr hwnd, string text, string caption, uint type);

    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimits {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimits {
        public BasicLimits Basic;
        public IoCounters Io;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    static int Main(string[] args) {
        string baseDir = AppDomain.CurrentDomain.BaseDirectory;
        string script = Path.Combine(baseDir, "host.js");
        string node = FindNode();
        if (node == null || !File.Exists(script)) {
            MessageBox(IntPtr.Zero, "No encuentro Node.js o host.js. Instala Node.js y reinicia Stream Dock.", "MS0 Alexa Casa", 0x10);
            return 1;
        }

        string argPath = Path.Combine(Path.GetTempPath(), "ms0-alexa-home-" + Process.GetCurrentProcess().Id + ".json");
        File.WriteAllText(argPath, ToJsonArray(args), new UTF8Encoding(false));

        IntPtr job = CreateJobObject(IntPtr.Zero, null);
        if (job != IntPtr.Zero) {
            ExtendedLimits limits = new ExtendedLimits();
            limits.Basic.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int size = Marshal.SizeOf(typeof(ExtendedLimits));
            IntPtr pointer = Marshal.AllocHGlobal(size);
            try {
                Marshal.StructureToPtr(limits, pointer, false);
                SetInformationJobObject(job, 9, pointer, (uint)size);
            } finally {
                Marshal.FreeHGlobal(pointer);
            }
        }

        ProcessStartInfo info = new ProcessStartInfo();
        info.FileName = node;
        info.Arguments = "\"" + script + "\" \"" + argPath + "\"";
        info.WorkingDirectory = baseDir;
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        Process process = Process.Start(info);
        if (process == null) return 1;
        if (job != IntPtr.Zero) AssignProcessToJobObject(job, process.Handle);
        process.WaitForExit();
        int code = process.ExitCode;
        if (job != IntPtr.Zero) CloseHandle(job);
        return code;
    }

    static string FindNode() {
        string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates = new string[] {
            Path.Combine(programFiles, "nodejs", "node.exe"),
            Path.Combine(localApp, "Programs", "nodejs", "node.exe")
        };
        foreach (string candidate in candidates) {
            if (File.Exists(candidate)) return candidate;
        }

        ProcessStartInfo info = new ProcessStartInfo("where.exe", "node.exe");
        info.UseShellExecute = false;
        info.RedirectStandardOutput = true;
        info.CreateNoWindow = true;
        Process process = Process.Start(info);
        if (process == null) return null;
        string output = process.StandardOutput.ReadToEnd();
        process.WaitForExit();
        string[] lines = output.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
        foreach (string line in lines) {
            string trimmed = line.Trim();
            if (File.Exists(trimmed)) return trimmed;
        }
        return null;
    }

    static string ToJsonArray(string[] args) {
        StringBuilder builder = new StringBuilder();
        builder.Append('[');
        for (int i = 0; i < args.Length; i++) {
            if (i > 0) builder.Append(',');
            builder.Append(JsonString(args[i] ?? ""));
        }
        builder.Append(']');
        return builder.ToString();
    }

    static string JsonString(string value) {
        StringBuilder builder = new StringBuilder();
        builder.Append('"');
        foreach (char c in value) {
            switch (c) {
                case '\\': builder.Append("\\\\"); break;
                case '"': builder.Append("\\\""); break;
                case '\n': builder.Append("\\n"); break;
                case '\r': builder.Append("\\r"); break;
                case '\t': builder.Append("\\t"); break;
                default:
                    if (c < 32) builder.Append("\\u").Append(((int)c).ToString("x4"));
                    else builder.Append(c);
                    break;
            }
        }
        builder.Append('"');
        return builder.ToString();
    }
}
