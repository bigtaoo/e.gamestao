using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using Game.Config;
using UnityEditor;
using UnityEngine;

namespace Game.Editor
{
    /// <summary>
    /// CSV -> ScriptableObject 配表管线。
    /// 数值同学改 Csv/ 下的表，点一次菜单就生效，不用碰 Unity 的 Inspector，也不会把 .asset 改乱。
    /// 已存在的资产按 id 原地更新，GUID 不变，所以引用不会断。
    /// </summary>
    public static class ConfigCsvImporter
    {
        private const string CsvRoot = "Assets/Game/Config/Csv";
        private const string GeneratedRoot = "Assets/Game/Config/Generated";

        [MenuItem("Game/配表/导入 CSV %#i")]
        public static void Import()
        {
            try
            {
                AssetDatabase.StartAssetEditing();
                EnsureFolder(GeneratedRoot);

                var crops = ImportCrops();
                var animals = ImportAnimals();
                var furnitures = ImportFurnitures();
                var items = ImportItems();

                Debug.Log($"[配表] 导入完成：作物 {crops}、动物 {animals}、家具 {furnitures}、道具 {items}");
            }
            finally
            {
                AssetDatabase.StopAssetEditing();
                AssetDatabase.SaveAssets();
                AssetDatabase.Refresh();
            }
        }

        private static int ImportCrops()
        {
            return ImportTable<CropDefAsset>("crops.csv", "crop", (asset, row) =>
                asset.Fill(
                    Int(row, "seedPrice"),
                    Int(row, "growSeconds"),
                    Int(row, "sellPrice"),
                    Int(row, "exp"),
                    Int(row, "yield", 1),
                    Int(row, "stages", 3),
                    Int(row, "unlockLevel", 1),
                    Str(row, "name")));
        }

        private static int ImportAnimals()
        {
            return ImportTable<AnimalDefAsset>("animals.csv", "animal", (asset, row) =>
                asset.Fill(
                    Str(row, "feedItemId"),
                    Int(row, "feedCount", 1),
                    Int(row, "produceSeconds"),
                    Str(row, "produceItemId"),
                    Int(row, "produceCount", 1),
                    Int(row, "exp"),
                    Int(row, "unlockLevel", 1),
                    Str(row, "name")));
        }

        private static int ImportFurnitures()
        {
            return ImportTable<FurnitureDefAsset>("furnitures.csv", "furn", (asset, row) =>
                asset.Fill(
                    Int(row, "price"),
                    Int(row, "comfort"),
                    Int(row, "width", 1),
                    Int(row, "height", 1),
                    Int(row, "layer", 1),
                    Str(row, "setId"),
                    Int(row, "unlockLevel", 1),
                    Str(row, "name")));
        }

        private static int ImportItems()
        {
            return ImportTable<ItemDefAsset>("items.csv", "item", (asset, row) =>
                asset.Fill(Int(row, "sellPrice"), Str(row, "name")));
        }

        private static int ImportTable<T>(string fileName, string subFolder, Action<T, Dictionary<string, string>> fill)
            where T : DefAsset
        {
            var path = Path.Combine(CsvRoot, fileName);
            if (!File.Exists(path))
            {
                Debug.LogWarning($"[配表] 找不到 {path}，跳过");
                return 0;
            }

            var folder = $"{GeneratedRoot}/{subFolder}";
            EnsureFolder(folder);

            var rows = ParseCsv(File.ReadAllText(path));
            foreach (var row in rows)
            {
                var id = Str(row, "id");
                if (string.IsNullOrEmpty(id))
                {
                    Debug.LogError($"[配表] {fileName} 有一行缺 id，已跳过");
                    continue;
                }

                var assetPath = $"{folder}/{id}.asset";
                var asset = AssetDatabase.LoadAssetAtPath<T>(assetPath);
                if (asset == null)
                {
                    asset = ScriptableObject.CreateInstance<T>();
                    asset.SetId(id);
                    AssetDatabase.CreateAsset(asset, assetPath);
                }
                else
                {
                    asset.SetId(id);
                }

                fill(asset, row);
                EditorUtility.SetDirty(asset);
            }

            return rows.Count;
        }

        /// <summary>只支持逗号分隔、无引号转义的简单 CSV——配表够用，复杂了应该换成外部工具。</summary>
        private static List<Dictionary<string, string>> ParseCsv(string text)
        {
            var result = new List<Dictionary<string, string>>();
            var lines = text.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            if (lines.Length < 2) return result;

            var headers = lines[0].Split(',');
            for (var i = 0; i < headers.Length; i++) headers[i] = headers[i].Trim();

            for (var i = 1; i < lines.Length; i++)
            {
                var line = lines[i].Trim();
                if (line.Length == 0 || line.StartsWith("#")) continue;

                var cells = line.Split(',');
                var row = new Dictionary<string, string>(headers.Length);
                for (var c = 0; c < headers.Length && c < cells.Length; c++)
                {
                    row[headers[c]] = cells[c].Trim();
                }

                result.Add(row);
            }

            return result;
        }

        private static string Str(Dictionary<string, string> row, string key) =>
            row.TryGetValue(key, out var value) ? value : "";

        private static int Int(Dictionary<string, string> row, string key, int fallback = 0)
        {
            if (!row.TryGetValue(key, out var value) || string.IsNullOrEmpty(value)) return fallback;
            return int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var result) ? result : fallback;
        }

        private static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;

            var parent = Path.GetDirectoryName(path)?.Replace('\\', '/');
            var leaf = Path.GetFileName(path);
            if (string.IsNullOrEmpty(parent) || string.IsNullOrEmpty(leaf)) return;

            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, leaf);
        }
    }
}
