import React, { useCallback, useState } from 'react'
import { IDockviewPanelProps } from 'dockview-react'
import { useProjectStore } from '../stores/project-store'
import { useEditorStore } from '../stores/editor-store'

interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

interface ContextMenu {
  x: number
  y: number
  node: FileNode
}

// Simple recursive tree item component — no external library
function TreeItem({
  node,
  depth,
  openDirs,
  toggleDir,
  onFileClick,
  activeFile,
  onContextMenu,
}: {
  node: FileNode
  depth: number
  openDirs: Set<string>
  toggleDir: (path: string) => void
  onFileClick: (path: string) => void
  activeFile: string | null
  onContextMenu: (e: React.MouseEvent, node: FileNode) => void
}) {
  const isOpen = openDirs.has(node.path)
  const isActive = node.path === activeFile

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: depth * 16 + 8,
          paddingRight: 4,
          paddingTop: 3,
          paddingBottom: 3,
          cursor: 'pointer',
          fontSize: 13,
          color: isActive ? '#6c9' : '#ccc',
          background: isActive ? 'rgba(102,204,153,0.1)' : 'transparent',
          userSelect: 'none',
        }}
        onClick={() => {
          if (node.isDirectory) {
            toggleDir(node.path)
          } else {
            onFileClick(node.path)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onContextMenu(e, node)
        }}
      >
        <span style={{ flexShrink: 0, fontSize: 12 }}>
          {node.isDirectory ? (isOpen ? '📂' : '📁') : '📄'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {node.name}
        </span>
      </div>
      {node.isDirectory && isOpen && node.children?.map((child) => (
        <TreeItem
          key={child.path}
          node={child}
          depth={depth + 1}
          openDirs={openDirs}
          toggleDir={toggleDir}
          onFileClick={onFileClick}
          activeFile={activeFile}
          onContextMenu={onContextMenu}
        />
      ))}
    </>
  )
}

export const FileTree: React.FC<IDockviewPanelProps> = () => {
  const { projectPath, fileTree, setProject } = useProjectStore()
  const { openFile, activeFile } = useEditorStore()
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [openDirs, setOpenDirs] = useState<Set<string>>(new Set())

  const toggleDir = useCallback((path: string) => {
    setOpenDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleOpenProject = useCallback(async () => {
    const result = await window.electronAPI.openProject()
    if (result) {
      setProject(result.projectPath, result.tree)
      setOpenDirs(new Set())
      await window.electronAPI.watchProject(result.projectPath)
    }
  }, [setProject])

  const closeContextMenu = useCallback(() => setContextMenu(null), [])

  const handleContextMenu = useCallback((e: React.MouseEvent, node: FileNode) => {
    setContextMenu({ x: e.clientX, y: e.clientY, node })
  }, [])

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
      <div style={{ flex: 1, overflow: 'auto', paddingTop: 4 }}>
        {fileTree.map((node) => (
          <TreeItem
            key={node.path}
            node={node}
            depth={0}
            openDirs={openDirs}
            toggleDir={toggleDir}
            onFileClick={openFile}
            activeFile={activeFile}
            onContextMenu={handleContextMenu}
          />
        ))}
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
