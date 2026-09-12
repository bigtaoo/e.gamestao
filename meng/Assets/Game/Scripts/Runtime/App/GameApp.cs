using System;
using Game.Config;
using Game.Runtime.Services;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace Game.Runtime.App
{
    /// <summary>
    /// 启动入口。挂在 Boot 场景唯一的物体上，跨场景常驻。
    /// 职责只有三件：装配依赖、读档、跳到下一个场景。
    /// </summary>
    [DefaultExecutionOrder(-1000)]
    public sealed class GameApp : MonoBehaviour
    {
        [SerializeField] private GameConfigAsset config;
        [SerializeField] private string firstScene = SceneNames.Login;
        [SerializeField] private int targetFrameRate = 60;

        public static GameApp Instance { get; private set; }

        public GameContext Context { get; private set; }

        public event Action<GameContext> Ready;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }

            Instance = this;
            DontDestroyOnLoad(gameObject);

            Application.targetFrameRate = targetFrameRate;
            Screen.sleepTimeout = SleepTimeout.SystemSetting;

            if (config == null)
            {
                Debug.LogError("[GameApp] 没有配置 GameConfigAsset，无法启动。");
                enabled = false;
                return;
            }

            Boot();
        }

        private void Boot()
        {
            var time = new GameTimeService();
            var storage = new LocalFileStorage();
            var saveService = new SaveService(storage, new JsonSaveCodec());

            Context = new GameContext(config, time, saveService);

            // TODO(M4): 接后端后在这里先 SyncWithServer(服务器时间)，再读档。
            var playerId = SystemInfo.deviceUniqueIdentifier;
            saveService.LoadOrCreate(playerId, time.NowUtc, config.StartPlotCount, config.StartCoin);

            Ready?.Invoke(Context);

            if (!string.IsNullOrEmpty(firstScene) && SceneManager.GetActiveScene().name != firstScene)
            {
                SceneManager.LoadScene(firstScene);
            }
        }

        private void Update()
        {
            Context?.SaveService.Tick(Time.deltaTime);
        }

        private void OnApplicationPause(bool paused)
        {
            if (paused) Context?.SaveService.Flush();
        }

        private void OnApplicationFocus(bool focused)
        {
            if (!focused) Context?.SaveService.Flush();
        }

        private void OnApplicationQuit()
        {
            Context?.SaveService.Flush();
        }

        private void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }
    }

    public static class SceneNames
    {
        public const string Boot = "Boot";
        public const string Login = "Login";
        public const string Home = "Home";
        public const string FriendHome = "FriendHome";
    }
}
