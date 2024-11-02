from flask import Flask, render_template, jsonify, request
from py2neo import Graph
import logging
from datetime import datetime

# 配置日志
LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'
logging.basicConfig(level=logging.INFO, format=LOG_FORMAT,
                    handlers=[logging.FileHandler('app.log'), logging.StreamHandler()])
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Neo4j数据库连接配置
NEO4J_HOST = 'bolt://localhost:7687'
NEO4J_AUTH = ('123', '123')


def get_db():
    """获取数据库连接"""
    try:
        return Graph(NEO4J_HOST, auth=NEO4J_AUTH)
    except Exception as e:
        logger.error(f"数据库连接失败: {str(e)}")
        return None


@app.route('/')
def index():
    """渲染主页"""
    try:
        return render_template('index.html')
    except Exception as e:
        logger.error(f"渲染主页失败: {str(e)}")
        return "服务器错误", 500


@app.route('/get_graph_data')
def get_graph_data():
    """获取图谱数据"""
    try:
        graph = get_db()
        if not graph:
            return jsonify({"error": "数据库连接失败"}), 500
        query = """
        MATCH (n)-[r]->(m)
        RETURN n, r, m
        """
        results = graph.run(query)
        nodes, edges, nodes_set, node_relationship_counts = process_results(results)
        logger.info(f"获取图谱数据成功 - 节点数: {len(nodes)}, 关系数: {len(edges)}")
        return jsonify({
            'nodes': nodes,
            'edges': edges,
            'stats': {
                'nodeCount': len(nodes),
                'edgeCount': len(edges),
                'timestamp': datetime.now().isoformat()
            }
        })
    except Exception as e:
        logger.error(f"获取图谱数据失败: {str(e)}")
        return jsonify({"error": str(e)}), 500


def process_results(results):
    nodes = []
    edges = []
    nodes_set = set()
    node_relationship_counts = {}
    for record in results:
        start_node = record['n']
        process_node(start_node, nodes_set, nodes, node_relationship_counts)
        end_node = record['m']
        process_node(end_node, nodes_set, nodes, node_relationship_counts)
        relationship = record['r']
        edge_data = {
            'from': str(start_node.identity),
            'to': str(end_node.identity),
            'label': type(relationship).__name__,
            'title': type(relationship).__name__,
            'properties': dict(relationship)
        }
        edges.append(edge_data)
        node_relationship_counts[start_node.identity] += 1
        node_relationship_counts[end_node.identity] += 1
    for node in nodes:
        node['size'] = (node_relationship_counts[int(node['id'])] or 1) * 10
    return nodes, edges, nodes_set, node_relationship_counts


def process_node(node, nodes_set, nodes, node_relationship_counts):
    """处理节点数据"""
    if node.identity not in nodes_set:
        properties = dict(node)
        labels = list(node.labels)
        label_name = labels[0] if labels else "Unknown"
        node_data = {
            'id': str(node.identity),
            'label': properties.get('name', '未命名'),
            'title': properties.get('name', '未命名'),
            'group': label_name,
            'properties': properties
        }
        nodes.append(node_data)
        nodes_set.add(node.identity)
        node_relationship_counts[node.identity] = 0


@app.route('/search_nodes/<query>')
def search_nodes(query):
    """搜索节点"""
    try:
        graph = get_db()
        if not graph:
            return jsonify({"error": "数据库连接失败"}), 500
        cypher_query = """
        MATCH (n)
        WHERE n.name =~ $name
        RETURN n
        LIMIT 10
        """
        results = graph.run(cypher_query, name=f"(?i).*{query}.*")
        nodes = []
        for record in results:
            node = record['n']
            properties = dict(node)
            labels = list(node.labels)
            nodes.append({
                'id': str(node.identity),
                'label': properties.get('name', '未命名'),
                'group': labels[0] if labels else "Unknown",
                'properties': properties
            })
        logger.info(f"搜索节点成功 - 关键词: {query}, 结果数: {len(nodes)}")
        return jsonify(nodes)
    except Exception as e:
        logger.error(f"搜索节点失败 - 关键词: {query}, 错误: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.errorhandler(404)
def page_not_found(e):
    """处理404错误"""
    logger.warning(f"访问未知页面: {request.url}")
    return "页面不存在", 404


@app.errorhandler(500)
def internal_server_error(e):
    """处理500错误"""
    logger.error(f"服务器错误: {str(e)}")
    return "服务器错误", 500


if __name__ == '__main__':
    logger.info("应用启动")
    app.run(debug=True, host='0.0.0.0', port=5010)