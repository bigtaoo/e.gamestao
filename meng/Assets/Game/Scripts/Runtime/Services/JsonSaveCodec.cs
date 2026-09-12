using System;
using Game.Core.Model;
using Game.Core.Services;
using UnityEngine;

namespace Game.Runtime.Services
{
    /// <summary>
    /// JsonUtility 编解码。够快、无依赖，代价是不支持字典和 null 区分——
    /// 所以 SaveData 里只用 List 和值类型，别加 Dictionary。
    /// </summary>
    public sealed class JsonSaveCodec : ISaveCodec
    {
        public string Encode(SaveData save) => JsonUtility.ToJson(save, false);

        public SaveData Decode(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;

            try
            {
                return JsonUtility.FromJson<SaveData>(raw);
            }
            catch (Exception e)
            {
                Debug.LogError($"[Save] 存档解析失败：{e.Message}");
                return null;
            }
        }

        public int PeekSchemaVersion(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return 0;

            try
            {
                return JsonUtility.FromJson<SchemaProbe>(raw)?.schemaVersion ?? 0;
            }
            catch
            {
                return 0;
            }
        }

        [Serializable]
        private class SchemaProbe
        {
            public int schemaVersion;
        }
    }
}
