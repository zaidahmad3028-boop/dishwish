import importlib.util
from pathlib import Path

import networkx as nx
import pytest
from fastapi.testclient import TestClient
from api.index import app
from engine.data import Ingredient, load_ingredients
from engine.recommender import Recommender, get_recommender


def item(name, priority=1, spicy=0, allergens=()):
    return Ingredient(name, 'Spices', 1, 0, 0, 0, 0, 0, 0, spicy, allergens, priority)


def test_catalog_matches_source():
    root = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location('build_engine_data', root / 'scripts/build_engine_data.py')
    module = importlib.util.module_from_spec(spec)
    import sys
    sys.path.insert(0, str(root / 'scripts'))
    try:
        spec.loader.exec_module(module)
        assert module.build_catalog() == (root / 'api/engine/ingredients.json').read_text()
    finally:
        sys.path.remove(str(root / 'scripts'))
    assert len(load_ingredients()) == 260
    assert len({x.name for x in load_ingredients()}) == 260
    assert get_recommender().graph.number_of_edges() == 260 * 259 // 2
    assert nx.is_frozen(get_recommender().graph)


def test_real_catalog_cumulative_scores():
    engine = get_recommender()
    rows = engine.recommend(['Mutton', 'Onion'], limit=50)
    assert len(rows) == 50
    for row in rows:
        assert row['name'] not in ['Mutton', 'Onion']
        assert set(row['contributions']) == {'Mutton', 'Onion'}
        assert row['score'] == pytest.approx(sum(row['contributions'].values()))
    assert rows == engine.recommend(['Onion', 'Mutton'], limit=50)


def test_second_selection_changes_ranking_not_just_last_selection():
    engine = Recommender([item('A'), item('B'), item('X'), item('Y')])
    # Controlled weighted graph to prove cumulative ranking independently of heuristic.
    for left, right, weight in [('A','B',0), ('A','X',.9), ('B','X',.1), ('A','Y',.6), ('B','Y',.8), ('X','Y',0)]:
        engine.graph[left][right]['weight'] = weight
    assert engine.recommend(['A'])[0]['name'] == 'X'
    rows = engine.recommend(['A','B'])
    assert rows[0]['name'] == 'Y'
    assert rows[0]['score'] == pytest.approx(1.4)


def test_ties_use_priority_then_name():
    engine = Recommender([item('Selected'), item('Zulu', 5), item('Alpha', 5), item('Low', 1)])
    assert [row['name'] for row in engine.recommend(['Selected'])] == ['Alpha','Zulu','Low']


def test_preferences_change_ranking():
    engine = Recommender([item('Selected', spicy=5), item('Mild',spicy=0), item('Hot',spicy=10)])
    assert engine.recommend(['Selected'], taste_preferences={'spicy':0})[0]['name'] == 'Mild'
    assert engine.recommend(['Selected'], taste_preferences={'spicy':10})[0]['name'] == 'Hot'


def test_allergen_filter_and_exhaustion():
    engine = Recommender([item('Selected'), item('Milk',allergens=('milk',)), item('Egg',allergens=('eggs',))])
    assert engine.recommend(['Selected'],excluded_allergens=['milk','eggs']) == []
    with pytest.raises(ValueError, match='conflicts'):
        engine.recommend(['Milk'],excluded_allergens=['milk'])


def test_canonical_names():
    assert get_recommender().recommend([' mUtToN ']) == get_recommender().recommend(['Mutton'])


@pytest.mark.parametrize('names,kwargs', [([],{}), (['Unknown'],{}), (['Mutton','mutton'],{}),
    (['Mutton'],{'limit':0}), (['Mutton'],{'excluded_allergens':['fake']}),
    (['Mutton'],{'taste_preferences':{'spicy':float('nan')}})])
def test_engine_rejects_invalid_input(names,kwargs):
    with pytest.raises(ValueError):
        get_recommender().recommend(names,**kwargs)


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def test_endpoint_and_health(client):
    assert client.get('/api/health').json()['status'] == 'ok'
    r = client.post('/api/recommend',json={'selected_ingredients':['Mutton','Onion'],
        'taste_preferences':{'spicy':8},'excluded_allergens':['milk'],'limit':5})
    assert r.status_code == 200
    rows = r.json()['recommendations']
    assert len(rows) == 5
    assert all('milk' not in row['allergens'] for row in rows)
    assert all(set(row['contributions']) == {'Mutton','Onion'} for row in rows)
    assert client.get('/openapi.json').status_code == 200


@pytest.mark.parametrize('body', [{}, {'selected_ingredients':[]}, {'selected_ingredients':['unknown']},
    {'selected_ingredients':['Mutton','mutton']}, {'selected_ingredients':['Mutton'],'limit':51},
    {'selected_ingredients':['Mutton'],'limit':True},
    {'selected_ingredients':['Mutton'],'taste_preferences':{'spicy':11}},
    {'selected_ingredients':['Mutton'],'taste_preferences':{'bitter':1}},
    {'selected_ingredients':['Mutton'],'excluded_allergens':['fake']},
    {'selected_ingredients':['Milk'],'excluded_allergens':['milk']},
    {'selected_ingredients':['Mutton'],'user_id':'spoof'},
    {'selected_ingredients':['Mutton']*21}])
def test_endpoint_validation(client,body):
    assert client.post('/api/recommend',json=body).status_code == 422


def test_cors(client):
    r=client.options('/api/recommend',headers={'Origin':'http://localhost:5173',
        'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
    assert r.status_code == 200
    assert r.headers['access-control-allow-origin'] == 'http://localhost:5173'
    r=client.options('/api/recommend',headers={'Origin':'https://untrusted.invalid',
        'Access-Control-Request-Method':'POST'})
    assert 'access-control-allow-origin' not in r.headers


def test_edge_weight_formula_and_bounds():
    from engine.cooking import cook_affinity
    from engine.recommender import category_affinity, pair_weight, taste_harmony, taste_similarity
    catalog = {i.name: i for i in load_ingredients()}
    graph = get_recommender().graph
    for u, v in [('Mutton', 'Onion'), ('Mango', 'Milk'), ('Basmati Rice', 'Salt'), ('Prawns', 'White Sugar')]:
        a, b = catalog[u], catalog[v]
        cook = cook_affinity(a, b)
        expected = (.35 * max(category_affinity(a, b), .9 * cook) + .35 * cook
                    + .20 * taste_similarity(a, b) + .10 * taste_harmony(a, b))
        assert graph[u][v]['weight'] == pytest.approx(expected) == pytest.approx(pair_weight(b, a))
    weights = [d['weight'] for _, _, d in graph.edges(data=True)]
    assert 0 <= min(weights) and max(weights) <= 1


def test_cooking_affinity_ranks_real_pairings_higher():
    graph = get_recommender().graph
    assert graph['Mutton']['Onion']['weight'] > graph['Mutton']['Mango']['weight']
    assert graph['Basmati Rice']['Green Cardamom (Elaichi)']['weight'] > graph['Basmati Rice']['Mayonnaise']['weight']
    assert graph['Milk']['White Sugar']['weight'] > graph['Milk']['Prawns']['weight']
