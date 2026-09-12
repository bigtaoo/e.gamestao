using System;
using System.IO;
using Game.Core.Services;
using UnityEngine;

namespace Game.Runtime.Services
{
    /// <summary>
    /// 本地文件存档，双缓冲写：先写 .tmp，再把旧档转成 .bak，最后替换正式档。
    /// 写到一半掉电时至少还有 .bak 可用，读取失败会自动回退。
    /// </summary>
    public sealed class LocalFileStorage : IStorage
    {
        private readonly string _root;

        public LocalFileStorage(string subFolder = "save")
        {
            _root = Path.Combine(Application.persistentDataPath, subFolder);
            Directory.CreateDirectory(_root);
        }

        public string Root => _root;

        public bool Exists(string key) => File.Exists(PathOf(key)) || File.Exists(BackupOf(key));

        public string Read(string key)
        {
            var path = PathOf(key);
            if (File.Exists(path))
            {
                try
                {
                    return File.ReadAllText(path);
                }
                catch (Exception e)
                {
                    Debug.LogError($"[Storage] 主存档读取失败，尝试备份：{e.Message}");
                }
            }

            var backup = BackupOf(key);
            if (!File.Exists(backup)) return null;

            try
            {
                return File.ReadAllText(backup);
            }
            catch (Exception e)
            {
                Debug.LogError($"[Storage] 备份存档也读取失败：{e.Message}");
                return null;
            }
        }

        public void Write(string key, string contents)
        {
            var path = PathOf(key);
            var temp = path + ".tmp";
            var backup = BackupOf(key);

            File.WriteAllText(temp, contents);

            if (File.Exists(path))
            {
                if (File.Exists(backup)) File.Delete(backup);
                File.Move(path, backup);
            }

            File.Move(temp, path);
        }

        public void Delete(string key)
        {
            foreach (var path in new[] { PathOf(key), BackupOf(key), PathOf(key) + ".tmp" })
            {
                if (File.Exists(path)) File.Delete(path);
            }
        }

        private string PathOf(string key) => Path.Combine(_root, key + ".json");
        private string BackupOf(string key) => Path.Combine(_root, key + ".bak");
    }
}
