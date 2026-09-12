using System.Collections.Generic;

namespace Game.Core.Systems
{
    /// <summary>
    /// 逻辑占位网格。和渲染完全解耦——等距投影、排序都在 View 层做，
    /// 这里只回答"这块地方能不能放"。农场地块和房间家具共用。
    /// </summary>
    public sealed class GridMap
    {
        private readonly int _width;
        private readonly int _height;
        private readonly Dictionary<int, bool[]> _layers = new Dictionary<int, bool[]>();

        public GridMap(int width, int height)
        {
            _width = width;
            _height = height;
        }

        public int Width => _width;
        public int Height => _height;

        /// <summary>旋转 90°/270° 时宽高互换。</summary>
        public static void GetFootprint(int width, int height, int rot, out int w, out int h)
        {
            if ((rot & 1) == 0)
            {
                w = width;
                h = height;
            }
            else
            {
                w = height;
                h = width;
            }
        }

        public bool IsInside(int x, int y, int w, int h)
        {
            if (w <= 0 || h <= 0) return false;
            return x >= 0 && y >= 0 && x + w <= _width && y + h <= _height;
        }

        public bool IsFree(int layer, int x, int y, int w, int h)
        {
            if (!IsInside(x, y, w, h)) return false;
            if (!_layers.TryGetValue(layer, out var cells)) return true;

            for (var dy = 0; dy < h; dy++)
            {
                for (var dx = 0; dx < w; dx++)
                {
                    if (cells[(y + dy) * _width + x + dx]) return false;
                }
            }

            return true;
        }

        public void Occupy(int layer, int x, int y, int w, int h)
        {
            if (!IsInside(x, y, w, h)) return;

            if (!_layers.TryGetValue(layer, out var cells))
            {
                cells = new bool[_width * _height];
                _layers[layer] = cells;
            }

            for (var dy = 0; dy < h; dy++)
            {
                for (var dx = 0; dx < w; dx++)
                {
                    cells[(y + dy) * _width + x + dx] = true;
                }
            }
        }

        public void Free(int layer, int x, int y, int w, int h)
        {
            if (!IsInside(x, y, w, h)) return;
            if (!_layers.TryGetValue(layer, out var cells)) return;

            for (var dy = 0; dy < h; dy++)
            {
                for (var dx = 0; dx < w; dx++)
                {
                    cells[(y + dy) * _width + x + dx] = false;
                }
            }
        }
    }
}
