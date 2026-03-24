import React, { useCallback } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { Tree, NodeRendererProps } from 'react-arborist'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'
// Type declarations for window.electronAPI are in src/types/electron.d.ts

interface TreeNode {
  id: string
  name: string
  path: string
  isDirectory: boolean
  children?: TreeNode[]
}

function toTreeData(nodes: any[]): TreeNode[] {
  return nodes.map((n) => ({
    id: n.path,
    name: n.name,
    path: n.path,
    isDirectory: n.isDirectory,
    children: n.children ? toTreeData(n.children) : undefined,
  }))
}

function Node({ node, style }: NodeRendererProps<TreeNode>) {
  const icon = node.data.isDirectory ? (node.isOpen ? '📂' : '📁') : '📄'
  const depth = node.level
  return (
    <div
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        paddingLeft: depth * 16 + 8,
        paddingRight: 4,
        paddingTop: 2,
        paddingBottom: 2,
        cursor: 'pointer',
        fontSize: 13,
        color: node.isSelected ? '#6c9' : '#ccc',
        background: node.isSelected ? 'rgba(102,204,153,0.1)' : 'transparent',
      }}
      onClick={() => node.isInternal ? node.toggle() : node.select()}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.data.name}</span>
    </div>
  )
}

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  const { projectPath, fileTree, setProject } = useProjectStore()
  const { openFile } = useEditorStore()

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI.openProject()
    if (result) {
      setProject(result.projectPath, result.tree)
      await window.electronAPI.watchProject(result.projectPath)
    }
  }, [setProject])

  const treeData = toTreeData(fileTree)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333' }}>
        <button
          onClick={handleOpenProject}
          style={{
            background: '#3a3a5e',
            color: '#ccc',
            border: 'none',
            padding: '4px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
            width: '100%',
          }}
        >
          {projectPath ? 'Change Project' : 'Open Project'}
        </button>
      </div>
      {projectPath && (
        <div style={{ padding: '4px 12px', color: '#888', fontSize: 11, borderBottom: '1px solid #333' }}>
          {projectPath.split('/').pop()}
        </div>
      )}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {treeData.length > 0 && (
          <Tree
            data={treeData}
            openByDefault={false}
            width="100%"
            indent={16}
            rowHeight={24}
            onSelect={(nodes) => {
              const node = nodes[0]
              if (node && !node.data.isDirectory) {
                openFile(node.data.path)
              }
            }}
          >
            {Node}
          </Tree>
        )}
      </div>
    </div>
  )
}
