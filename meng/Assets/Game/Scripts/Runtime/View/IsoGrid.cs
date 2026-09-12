using UnityEngine;

namespace Game.Runtime.View
{
    /// <summary>
    /// 等距网格与世界坐标互转。渲染层专用——逻辑层只认 (x, y) 整数格。
    /// 排序用 (x + y) 保证近处遮远处，layer 做同格内的层级微调。
    /// </summary>
    public static class IsoGrid
    {
        public const float TileWidth = 1.28f;
        public const float TileHeight = 0.64f;

        public static Vector2 GridToWorld(int x, int y)
        {
            return new Vector2((x - y) * TileWidth * 0.5f, -(x + y) * TileHeight * 0.5f);
        }

        public static Vector2Int WorldToGrid(Vector2 world)
        {
            var a = world.x / (TileWidth * 0.5f);
            var b = -world.y / (TileHeight * 0.5f);
            return new Vector2Int(Mathf.FloorToInt((a + b) * 0.5f), Mathf.FloorToInt((b - a) * 0.5f));
        }

        /// <summary>同一格里 layer 越大越靠前；跨格时 (x + y) 越大越靠前。</summary>
        public static int SortingOrder(int x, int y, int layer) => (x + y) * 10 + layer;
    }
}
