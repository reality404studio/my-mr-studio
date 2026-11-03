using System;
using System.IO;
using System.Linq;
using Reality404.BuildGate;

static class Program
{
    static int Main(string[] args)
    {
        if (args.Length < 1 || !Directory.Exists(Path.Combine(args[0], "Assets")))
        {
            Console.Error.WriteLine("usage: Checker <unity project root>");
            return 2;
        }
        string root = Path.GetFullPath(args[0]).TrimEnd('/');
        var results = GateFileChecks.RunAll(root);
        foreach (var r in results) Console.WriteLine(r);
        int fails = results.Count(r => r.Level == GateLevel.Fail);
        Console.WriteLine(fails == 0 ? "files: PASS" : $"files: FAIL ({fails})");
        return fails == 0 ? 0 : 1;
    }
}
