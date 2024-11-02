document.addEventListener('DOMContentLoaded', function() {
    let network = null;
    let allNodes = [];
    let isPhysicsEnabled = true;
    let searchTimeout = null;
    let currentHighlightedIndex = -1;
    let searchResults = [];
    let nodesDataset = null;
    let edgesDataset = null;

    // 初始化网络可视化
    function initializeNetwork(data) {
        const container = document.getElementById('graph');

        // 计算节点大小
        const nodeSizes = {};
        data.edges.forEach(edge => {
            nodeSizes[edge.from] = (nodeSizes[edge.from] || 0) + 1;
            nodeSizes[edge.to] = (nodeSizes[edge.to] || 0) + 1;
        });

        // 数据集初始化，并截断节点名称
        nodesDataset = new vis.DataSet(data.nodes.map(node => {
            const size = (nodeSizes[node.id] || 10) * 25 + 150;
            const fontSize = Math.min(size / 2, 150);  // 动态设置字体大小，最大为150
            const nodeColor = getNodeColor(node.group);  // 获取节点颜色
            const fontColor = isDarkColor(nodeColor) ? '#FFFFFF' : '#000000';  // 根据节点颜色设置字体颜色
            return {
                ...node,
                fullLabel: node.label, // 保存节点全名
                label: node.label.length > 5 ? node.label.substring(0, 5) + '..' : node.label,
                size: size * 1.25 + 50,  // 根据关系数量动态设置节点大小
                font: {
                    size: fontSize,  // 根据节点大小动态设置字体大小
                    color: fontColor,  // 动态设置字体颜色
                    face: 'Microsoft YaHei',
                    align: 'center',
                    vadjust: -1.9 * size  // 将标签放在节点内部
                }
            };
        }));
        edgesDataset = new vis.DataSet(data.edges);
        allNodes = data.nodes;

        // 网络配置选项
        const options = {
            nodes: {
                shape: 'dot',
                borderWidth: 2,
                shadow: {
                    enabled: true,
                    color: 'rgba(0,0,0,0.2)',
                    size: 3,
                    x: 1,
                    y: 1
                }
            },
            edges: {
                width: 40,
                color: {
                    color: '#76b3f4',
                    highlight: '#76b3f4',
                    hover: '#76b3f4'
                },
                arrows: {
                    to: {
                        enabled: true,
                        scaleFactor: 0.1
                    }
                },
                smooth: {
                    enabled: true,
                    type: 'continuous',
                    roundness: 0.2
                },
                font: {
                    size: 100,
                    align: 'middle',
                    background: 'white'

                }
            },
            physics: {
                enabled: true,
                solver: 'forceAtlas2Based',
                forceAtlas2Based: {
                    gravitationalConstant: -2500,
                    centralGravity: 0.005,
                    springLength: 1000,
                    springConstant: 0.01,
                    damping: 0.3,
                    avoidOverlap: 1
                },
                stabilization: {
                    enabled: true,
                    iterations: 2000,
                    updateInterval: 50
                },
                maxVelocity: 50,
                minVelocity: 0.1,
                timestep: 0.3
            },
            layout: {
                randomSeed: 42,
                improvedLayout: true
            },
            interaction: {
                hover: true,
                tooltipDelay: 200,
                zoomView: true,
                dragView: true,
                navigationButtons: true,
                keyboard: true
            },
            groups: {
                Group1: {
                    color: {
                        background: '#ca9681',
                        border: '#f46f56',
                        highlight: {background: '#FFB19E', border: '#FF7D6B'},
                        hover: {background: '#FFB19E', border: '#FF7D6B'}
                    }
                },
                Group2: {
                    color: {
                        background: '#a5dda5',
                        border: '#57f357',
                        highlight: {background: '#A8F5A8', border: '#4BE34B'},
                        hover: {background: '#A8F5A8', border: '#4BE34B'}
                    }
                },
                Group3: {
                    color: {
                        background: '#9fcfdf',
                        border: '#285cf8',
                        highlight: {background: '#A0D8F1', border: '#6181E5'},
                        hover: {background: '#A0D8F1', border: '#6181E5'}
                    }
                },
                Group4: {
                    color: {
                        // 继续其它配置...
                    }
                }
            }
        };

        // 创建网络实例
        network = new vis.Network(container, {
            nodes: nodesDataset,
            edges: edgesDataset
        }, options);

        setupNetworkEvents();
    }

    // 判断颜色是否为深色
    function isDarkColor(color) {
        const rgb = hexToRgb(color);
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        return brightness < 128;
    }

    // 将十六进制颜色转换为RGB
    function hexToRgb(hex) {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return { r, g, b };
    }

    // 获取节点颜色（根据节点组）
    function getNodeColor(group) {
        const groupColors = {
            Group1: '#FFA07A',
            Group2: '#90EE90',
            Group3: '#87CEEB',
            Group4: '#D3D3D3'
        };
        return groupColors[group] || '#D3D3D3';  // 默认颜色为浅色
    }

    // 设置网络事件
    function setupNetworkEvents() {
        // 网络稳定后的处理
        network.on('stabilizationIterationsDone', function() {
            console.log('Network stabilized');
            network.fit({
                animation: {
                    duration: 1000,
                    easingFunction: 'easeInOutQuad'
                }
            });
        });

        // 选择节点事件
        network.on('selectNode', function(params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = nodesDataset.get(nodeId);
                showNodeInfo(node);
            }
        });

        // 取消选择事件
        network.on('deselectNode', function() {
            hideNodeInfo();
        });
    }

    // 搜索功能实现
    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        const searchStats = document.getElementById('searchStats');

        searchInput.addEventListener('input', function(e) {
            const searchTerm = e.target.value.toLowerCase().trim();

            if (searchTerm.length < 1) {
                searchResults.style.display = 'none';
                searchStats.textContent = '';
                return;
            }

            // 执行搜索
            const results = allNodes.filter(node => {
                const nodeLabel = (node.label || '').toLowerCase();
                const nodeGroup = (node.group || '').toLowerCase();
                return nodeLabel.includes(searchTerm) || nodeGroup.includes(searchTerm);
            }).slice(0, 10);

            // 更新搜索统计
            searchStats.textContent = `找到 ${results.length} 个匹配项`;

            // 显示搜索结果
            displaySearchResults(results);
        });

        // 处理搜索结果点击
        searchResults.addEventListener('click', function(e) {
            const resultItem = e.target.closest('.search-result-item');
            if (resultItem) {
                const nodeId = resultItem.dataset.nodeId;
                focusNode(nodeId);
                searchResults.style.display = 'none';
                searchInput.value = resultItem.textContent;
            }
        });
    }

    // 显示搜索结果
    function displaySearchResults(results) {
        const searchResults = document.getElementById('searchResults');
        searchResults.innerHTML = '';

        if (results.length > 0) {
            results.forEach(node => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                div.textContent = `${node.label} (${node.group})`;
                div.dataset.nodeId = node.id;
                searchResults.appendChild(div);
            });
            searchResults.style.display = 'block';
        } else {
            searchResults.style.display = 'none';
        }
    }

    // 聚焦节点
    function focusNode(nodeId) {
        network.focus(nodeId, {
            scale: 0.2,
            animation: {
                duration: 1000,
                easingFunction: 'easeInOutQuad'
            }
        });
        network.selectNodes([nodeId]);
    }

    // 显示节点信息
    function showNodeInfo(node) {
        const nodeInfo = document.getElementById('nodeInfo');
        nodeInfo.innerHTML = `
            <h3>${node.fullLabel}</h3>
            <p>定义:</p>
            ${node.properties ? 
              `<div class="node-properties">${
                Object.entries(node.properties)
                  .filter(([key]) => key !== 'name')
                  .map(([key, value]) => `   ${value}`)
                  .join('<br>')
              }</div>` : 
              '<p>无定义信息</p>'
            }
        `;
        nodeInfo.style.display = 'block';
    }

    // 隐藏节点信息
    function hideNodeInfo() {
        const nodeInfo = document.getElementById('nodeInfo');
        nodeInfo.style.display = 'none';
    }

    // 初始化控制按钮
    function setupControls() {
        const togglePhysics = document.getElementById('togglePhysics');
        const physicsStatus = document.getElementById('physicsStatus');
        const resetView = document.getElementById('resetView');
    }

    // 加载数据并初始化
    function loadData() {
        fetch('/get_graph_data')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json();
            })
            .then(data => {
                console.log('Received data:', data);
                if (!data.nodes || !data.edges) {
                    throw new Error('Invalid data format');
                }
                initializeNetwork(data);
                setupSearch();
                setupControls();
            })
            .catch(error => {
                console.error('Error loading data:', error);
                document.getElementById('graph').innerHTML =
                    `<div class="error-message">加载数据失败: ${error.message}</div>`;
            });
    }

    // 开始��载数据
    loadData();

    // 添加键盘事件监听
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const searchResults = document.getElementById('searchResults');
            searchResults.style.display = 'none';
        }
    });

    // 点击空白处关闭搜索结果
    document.addEventListener('click', function(e) {
        const searchResults = document.getElementById('searchResults');
        const searchInput = document.getElementById('searchInput');
        if (!searchResults.contains(e.target) && e.target !== searchInput) {
            searchResults.style.display = 'none';
        }
    });
});

// 显示信息面板
nodeInfo.classList.add('visible');



