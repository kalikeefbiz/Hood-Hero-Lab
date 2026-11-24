"""Swap canonical GLB animation channels while preserving its bind and mesh data."""
import argparse
import copy
import json
import math
import struct


def load(path):
    payload = path.read_bytes()
    magic, version, length, json_length = struct.unpack_from('<4sIII', payload)
    assert (magic, version, length) == (b'glTF', 2, len(payload))
    return json.loads(payload[20:20 + json_length]), payload[28 + json_length:]


def save(path, document, binary):
    metadata = json.dumps(document, separators=(',', ':')).encode()
    metadata += b' ' * (-len(metadata) % 4)
    binary += b'\0' * (-len(binary) % 4)
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 28 + len(metadata) + len(binary))
                     + struct.pack('<I4s', len(metadata), b'JSON') + metadata
                     + struct.pack('<I4s', len(binary), b'BIN\0') + binary)


def replace(canonical, baked, output):
    target, data = load(canonical)
    source, capture = load(baked)
    data = bytearray(data)
    target_indices = {node['name']: index for index, node in enumerate(target['nodes'])}
    parents = lambda doc: {child: node['name'] for node in doc['nodes'] for child in node.get('children', [])}
    target_parents, source_parents = parents(target), parents(source)
    assert target['skins'][0]['joints']
    names = {target['nodes'][index]['name'] for index in target['skins'][0]['joints']}
    for i, node in enumerate(source['nodes']):
        if node['name'] not in names:
            continue
        j = target_indices[node['name']]
        ref = target['nodes'][j]
        assert target_parents.get(j) == source_parents.get(i), node['name']
        for key, default in [('rotation', [0, 0, 0, 1]), ('translation', [0, 0, 0]), ('scale', [1, 1, 1])]:
            assert math.dist(ref.get(key, default), node.get(key, default)) < 1e-5, (node['name'], key)

    # Retain all canonical indices and the original binary prefix. Old animation
    # views can share compressed blocks with other accessors, so keep those bytes.
    cache = {}
    def accessor(index):
        if index in cache:
            return cache[index]
        a = copy.deepcopy(source['accessors'][index])
        view = copy.deepcopy(source['bufferViews'][a['bufferView']])
        start = view.get('byteOffset', 0)
        assert view['buffer'] == 0 and 'extensions' not in view
        data.extend(b'\0' * (-len(data) % 4))
        view['byteOffset'] = len(data)
        data.extend(capture[start:start + view['byteLength']])
        a['bufferView'] = len(target['bufferViews'])
        target['bufferViews'].append(view)
        cache[index] = len(target['accessors'])
        target['accessors'].append(a)
        return cache[index]

    target['animations'] = []
    for clip in source['animations']:
        channels, samplers = [], []
        for channel in clip['channels']:
            channel = copy.deepcopy(channel)
            node = source['nodes'][channel['target']['node']]['name']
            path = channel['target']['path']
            if node not in names or (path != 'rotation' and (path, node) != ('translation', 'spine')):
                continue
            if node == 'root':
                continue
            sampler = copy.deepcopy(clip['samplers'][channel['sampler']])
            for key in ('input', 'output'):
                sampler[key] = accessor(sampler[key])
            channel['sampler'] = len(samplers)
            channel['target']['node'] = target_indices[node]
            channels.append(channel)
            samplers.append(sampler)
        target['animations'].append({'name': clip['name'], 'channels': channels, 'samplers': samplers})
    target['buffers'][0]['byteLength'] = len(data)
    save(output, target, data)


if __name__ == '__main__':
    from pathlib import Path
    cli = argparse.ArgumentParser()
    cli.add_argument('canonical', type=Path)
    cli.add_argument('baked', type=Path)
    cli.add_argument('output', type=Path)
    args = cli.parse_args()
    replace(args.canonical, args.baked, args.output)
