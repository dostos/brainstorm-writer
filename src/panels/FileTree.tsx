import React, { useCallback, useState } from 'react'
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

interface ContextMenu {
  x: number
  y: number
  node: TreeNode
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

function Node({ node, style, onContextMenu, onFileClick }: NodeRendererProps<TreeNode> & {
  onContextMenu?: (e: React.MouseEvent, data: TreeNode) => void
  onFileClick?: (path: string) => void
}) {
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
      onClick={() => {
        if (node.isInternal) {
          node.toggle()
        } else {
          // Directly open file by full path — avoid react-arborist selection indirection
          onFileClick?.(node.data.path)
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onContextMenu?.(e, node.data)
      }}
    >
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.data.name}</span>
    </div>
  )
}

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  const { projectPath, fileTree, setProject } = useProjectStore()
  const { openFile } = useEditorStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI.openProject()
    if (result) {
      setProject(result.projectPath, result.tree)
      await window.electronAPI.watchProject(result.projectPath)
    }
  }, [setProject])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: TreeNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

  const refreshTree = useCallback(async () => {
    if (!projectPath) return
    const tree = await window.electronAPI.scanProject()
    setProject(projectPath, tree)
  }, [projectPath, setProject])

  const handleNewFile = useCallback(async () => {
    if (!contextMenu) return
    const node = contextMenu.node
    const dir = node.isDirectory ? node.path : node.path.substring(0, node.path.lastIndexOf('/'))
    closeContextMenu()
    const name = window.prompt('New file name (e.g. chapter.tex):')
    if (!name || !name.trim()) return
    const newPath = dir + '/' + name.trim()
    try {
      const tree = await window.electronAPI.createFile(newPath, '')
      setProject(projectPath!, tree)
    } catch (err: any) {
      alert('Error creating file: ' + err.message)
    }
  }, [contextMenu, closeContextMenu, projectPath, setProject])

  const handleRename = useCallback(async () => {
    if (!contextMenu) return
    const node = contextMenu.node
    closeContextMenu()
    const newName = window.prompt('New name:', node.name)
    if (!newName || !newName.trim() || newName.trim() === node.name) return
    const dir = node.path.substring(0, node.path.lastIndexOf('/'))
    const newPath = dir + '/' + newName.trim()
    try {
      const tree = await window.electronAPI.renameFile(node.path, newPath)
      setProject(projectPath!, tree)
    } catch (err: any) {
      alert('Error renaming: ' + err.message)
    }
  }, [contextMenu, closeContextMenu, projectPath, setProject])

  const handleDelete = useCallback(async () => {
    if (!contextMenu) return
    const node = contextMenu.node
    closeContextMenu()
    const confirmed = window.confirm(`Delete "${node.name}"? This cannot be undone.`)
    if (!confirmed) return
    try {
      const tree = await window.electronAPI.deleteFile(node.path)
      setProject(projectPath!, tree)
    } catch (err: any) {
      alert('Error deleting: ' + err.message)
    }
  }, [contextMenu, closeContextMenu, projectPath, setProject])

  const treeData = toTreeData(fileTree)

  // NodeRenderer wrapper to inject handlers
  const NodeWithMenu = useCallback((props: NodeRendererProps<TreeNode>) => (
    <Node {...props} onContextMenu={handleContextMenu} onFileClick={openFile} />
  ), [handleContextMenu, openFile])

  return (
    <div
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      onClick={closeContextMenu}
    >
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
            onSelect={() => {
              // File opening is handled directly in Node onClick via onFileClick
            }}
          >
            {NodeWithMenu}
          </Tree>
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: '#2a2a3e',
            border: '1px solid #444',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 9999,
            minWidth: 140,
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={handleNewFile}
            style={{ padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: '#ccc' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a5e')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            New File
          </div>
          <div
            onClick={handleRename}
            style={{ padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: '#ccc' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a5e')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Rename
          </div>
          <div
            onClick={handleDelete}
            style={{ padding: '6px 14px', cursor: 'pointer', fontSize: 12, color: '#f66' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#3a3a5e')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Delete
          </div>
        </div>
      )}
    </div>
  )
}
