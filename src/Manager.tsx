// @ts-nocheck
import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import {
  Button,
  ButtonBase,
  Avatar,
  Box,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  AppBar,
  IconButton,
  Toolbar,
  Stack,
  Modal,
  Tabs,
  Tab,
  Select,
  MenuItem,
  Checkbox,
  FormControlLabel,
} from "@mui/material";
import { styled } from "@mui/system";
import { useDropzone } from "react-dropzone";
import { Label, PUBLISH_QDN_RESOURCE } from "./actions/PUBLISH_QDN_RESOURCE";
import { ShowAction, Transition } from "./ShowAction";
import { ContextMenuPinnedFiles } from "./ContextMenuPinnedFiles";
import { useModal } from "./useModal";
import {
  discoverQManagerResourcesByName,
  getPersistedFileSystemQManager,
  importFileSystemQManagerFromQDN,
  publishFileSystemQManagerToQDN,
  saveFileSystemQManagerEverywhere,
} from "./storage";
import { SelectedFile } from "./File";
import { FileSystemBreadcrumbs } from "./FileSystemBreadcrumbs";
import { Spacer } from "./components/Spacer";
import FolderIcon from "@mui/icons-material/Folder";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import InsertDriveFileIcon from "@mui/icons-material/InsertDriveFile";
import PushPinIcon from "@mui/icons-material/PushPin";
import {
  base64ToUint8Array,
  handleImportClick,
  objectToBase64,
  resolvePreferredName,
  uint8ArrayToObject,
} from "./utils";
import { openToast } from "./components/openToast";
const initialFileSystem = [
  {
    type: "folder",
    name: "Root",
    children: [],
  },
];

const initialGroupFileSystem = {};
const RECOVERED_IMPORTS_FOLDER = "Recovered Imports";
const SHOW_THUMBNAILS_KEY = "q-manager-show-thumbnails";
const MAX_TEXT_PREVIEW_CHARS = 120000;

const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "json",
  "csv",
  "tsv",
  "xml",
  "yaml",
  "yml",
  "toml",
  "ini",
  "log",
  "js",
  "mjs",
  "cjs",
  "ts",
  "jsx",
  "tsx",
  "css",
  "html",
  "htm",
  "sh",
  "bat",
  "py",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
  "go",
  "rs",
  "sol",
]);

const EXTRA_TEXT_MIME_TYPES = new Set([
  "application/json",
  "application/xml",
  "application/yaml",
  "application/x-yaml",
  "application/toml",
  "application/javascript",
  "application/x-javascript",
  "application/typescript",
  "application/x-sh",
  "application/sql",
]);

const getServiceName = (file) => {
  const candidates = [file?.service, file?.service?.name, file?.serviceName];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return "";
};

const getResourcePreviewUrl = (file) => {
  const service = getServiceName(file);
  const qortalName =
    typeof file?.qortalName === "string" && file.qortalName.trim()
      ? file.qortalName
      : "";
  if (!service || !qortalName || !file?.identifier) return "";
  return `/arbitrary/${encodeURIComponent(service)}/${encodeURIComponent(
    qortalName
  )}/${encodeURIComponent(file.identifier)}`;
};

const safeLower = (value) => {
  if (typeof value === "string") return value.toLowerCase();
  if (value === undefined || value === null) return "";
  try {
    return String(value).toLowerCase();
  } catch (error) {
    return "";
  }
};

const safeUpper = (value) => {
  if (typeof value === "string") return value.toUpperCase();
  if (value === undefined || value === null) return "";
  try {
    return String(value).toUpperCase();
  } catch (error) {
    return "";
  }
};

const getFileNameForInference = (file) => {
  const candidates = [
    file?.filename,
    file?.displayName,
    file?.name,
    file?.title,
    file?.fetchedResourceProperties?.filename,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return "";
};

const getFileExtension = (file) => {
  const name = getFileNameForInference(file);
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return safeLower(parts.pop());
};

const inferMimeTypeFromExtension = (extension) => {
  const ext = safeLower(extension);
  if (!ext) return "";

  const extensionToMime = {
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    json: "application/json",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    xml: "application/xml",
    yaml: "application/yaml",
    yml: "application/yaml",
    toml: "application/toml",
    ini: "text/plain",
    log: "text/plain",
    js: "application/javascript",
    mjs: "application/javascript",
    cjs: "application/javascript",
    ts: "application/typescript",
    jsx: "text/jsx",
    tsx: "text/tsx",
    css: "text/css",
    html: "text/html",
    htm: "text/html",
    sh: "application/x-sh",
    bat: "text/plain",
    py: "text/x-python",
    java: "text/x-java-source",
    c: "text/x-c",
    cpp: "text/x-c++",
    h: "text/x-c",
    hpp: "text/x-c++",
    go: "text/x-go",
    rs: "text/plain",
    sol: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp4: "video/mp4",
    webm: "video/webm",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    mkv: "video/x-matroska",
    avi: "video/x-msvideo",
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    flac: "audio/flac",
  };

  return extensionToMime[ext] || "";
};

const isTextLikeMimeType = (mimeType) => {
  const normalized = safeLower(mimeType);
  if (!normalized) return false;
  if (normalized.startsWith("text/")) return true;
  return EXTRA_TEXT_MIME_TYPES.has(normalized);
};

const inferPreviewKind = (file) => {
  const mime = safeLower(file?.mimeType);
  const service =
    safeUpper(getServiceName(file)) ||
    safeUpper(file?.service) ||
    safeUpper(file?.service?.name) ||
    safeUpper(file?.serviceName);
  const name = safeLower(getFileNameForInference(file));
  const extension = getFileExtension(file);
  const extensionMime = inferMimeTypeFromExtension(extension);
  const effectiveMime = mime || extensionMime;

  if (effectiveMime.startsWith("image/")) return "image";
  if (effectiveMime.startsWith("video/")) return "video";
  if (effectiveMime.startsWith("audio/")) return "audio";
  if (isTextLikeMimeType(effectiveMime) || TEXT_PREVIEW_EXTENSIONS.has(extension))
    return "text";

  if (
    service.includes("IMAGE") ||
    service.includes("THUMBNAIL") ||
    /\.(png|jpg|jpeg|gif|webp|bmp|svg|avif)$/i.test(name)
  ) {
    return "image";
  }
  if (service.includes("VIDEO") || /\.(mp4|webm|m4v|mov|mkv|avi)$/i.test(name)) {
    return "video";
  }
  if (service.includes("AUDIO") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return "audio";
  }

  return "unknown";
};

const getItemDisplayName = (item) => {
  if (!item) return "";
  if (item.type === "file") return item.displayName || item.name || "";
  return item.name || "";
};

const getItemSizeBytes = (item) => {
  if (!item || item.type !== "file") return null;
  const candidates = [
    item?.sizeInBytes,
    item?.size,
    item?.fileSize,
    item?.dataSize,
    item?.createdSize,
    item?.totalSize,
  ];
  for (const candidate of candidates) {
    const numericValue = Number(candidate);
    if (Number.isFinite(numericValue) && numericValue >= 0) {
      return numericValue;
    }
  }
  return null;
};

const formatBytes = (value) => {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = -1;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  if (unitIndex < 0) return `${bytes} B`;
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unitIndex]}`;
};

const getNodeSelectionKey = (item) =>
  `${item?.type || ""}|${item?.name || ""}|${item?.identifier || ""}|${
    item?.service || ""
  }|${item?.group || 0}`;

const FilePreviewDialog = ({ file, onClose }) => {
  const previewKind = inferPreviewKind(file);
  const previewUrl = getResourcePreviewUrl(file);
  const [previewError, setPreviewError] = useState(false);
  const [textPreview, setTextPreview] = useState("");
  const [textPreviewLoading, setTextPreviewLoading] = useState(false);
  const [textPreviewError, setTextPreviewError] = useState("");

  useEffect(() => {
    setPreviewError(false);
  }, [file?.identifier, file?.service, file?.qortalName]);

  useEffect(() => {
    setTextPreview("");
    setTextPreviewError("");
    setTextPreviewLoading(false);
  }, [file?.identifier, file?.service, file?.qortalName, previewKind]);

  useEffect(() => {
    if (!file || previewKind !== "text" || !previewUrl) {
      return;
    }

    const controller = new AbortController();
    let disposed = false;

    const trimForPreview = (textValue) => {
      const fullText = textValue || "";
      if (fullText.length <= MAX_TEXT_PREVIEW_CHARS) {
        return fullText;
      }
      return `${fullText.slice(
        0,
        MAX_TEXT_PREVIEW_CHARS
      )}\n\n[Preview truncated to ${MAX_TEXT_PREVIEW_CHARS.toLocaleString()} characters]`;
    };

    const decodeBase64Utf8 = (encodedText) => {
      const binary = atob(encodedText);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    };

    const fetchTextPreview = async () => {
      setTextPreviewLoading(true);
      setTextPreviewError("");

      try {
        const base64Response = await fetch(`${previewUrl}?encoding=base64`, {
          signal: controller.signal,
        });
        if (!base64Response.ok) {
          throw new Error(`Base64 fetch failed (${base64Response.status})`);
        }
        const base64Text = await base64Response.text();
        const decoded = trimForPreview(decodeBase64Utf8(base64Text));
        if (disposed) return;
        setTextPreview(decoded);
      } catch (base64Error) {
        if (controller.signal.aborted || disposed) return;
        try {
          const plainResponse = await fetch(previewUrl, { signal: controller.signal });
          if (!plainResponse.ok) {
            throw new Error(`Text fetch failed (${plainResponse.status})`);
          }
          const plainText = await plainResponse.text();
          if (disposed) return;
          setTextPreview(trimForPreview(plainText));
        } catch (plainError) {
          if (controller.signal.aborted || disposed) return;
          setTextPreviewError(
            plainError?.message ||
              base64Error?.message ||
              "Could not load text preview"
          );
        }
      } finally {
        if (!disposed) {
          setTextPreviewLoading(false);
        }
      }
    };

    fetchTextPreview();

    return () => {
      disposed = true;
      controller.abort();
    };
  }, [file, previewKind, previewUrl]);

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      maxWidth='lg'
      fullWidth
      PaperProps={{
        style: {
          backgroundColor: "rgb(39, 40, 44)",
          color: "#ffffff",
        },
      }}
    >
      <DialogTitle>{getItemDisplayName(file) || "Preview"}</DialogTitle>
      <DialogContent>
        {!previewUrl && (
          <Typography>Preview unavailable for this file.</Typography>
        )}
        {!!previewUrl && previewKind === "image" && !previewError && (
          <Box
            component='img'
            src={previewUrl}
            onError={() => setPreviewError(true)}
            sx={{
              width: "100%",
              maxHeight: "70vh",
              objectFit: "contain",
              borderRadius: "8px",
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
          />
        )}
        {!!previewUrl && previewKind === "video" && !previewError && (
          <Box
            component='video'
            controls
            preload='metadata'
            onError={() => setPreviewError(true)}
            src={previewUrl}
            sx={{
              width: "100%",
              maxHeight: "70vh",
              borderRadius: "8px",
              backgroundColor: "rgba(0,0,0,0.2)",
            }}
          />
        )}
        {!!previewUrl && previewKind === "audio" && !previewError && (
          <Box
            component='audio'
            controls
            preload='metadata'
            onError={() => setPreviewError(true)}
            src={previewUrl}
            sx={{ width: "100%" }}
          />
        )}
        {!!previewUrl && previewKind === "text" && (
          <>
            {textPreviewLoading && <Typography>Loading text preview...</Typography>}
            {!textPreviewLoading && !!textPreviewError && (
              <Typography>{textPreviewError}</Typography>
            )}
            {!textPreviewLoading && !textPreviewError && (
              <Box
                component='pre'
                sx={{
                  width: "100%",
                  maxHeight: "70vh",
                  overflow: "auto",
                  borderRadius: "8px",
                  backgroundColor: "rgba(0,0,0,0.28)",
                  padding: "12px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  fontSize: "13px",
                }}
              >
                {textPreview || "(File is empty)"}
              </Box>
            )}
          </>
        )}
        {!!previewUrl &&
          (previewKind === "unknown" || (previewKind !== "text" && previewError)) && (
            <Typography>
              Could not preview this resource inline. It may be encrypted or not a
              supported media type.
            </Typography>
          )}
      </DialogContent>
      <DialogActions>
        <Button variant='contained' onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const SortableItem = ({
  item,
  onClick,
  removeFile,
  removeDirectory,
  rename,
  fileSystem,
  moveNode,
  currentPath,
  selected,
  onToggleSelect,
  onPreview,
  showThumbnails,
  onHydrateMetadata,
  onTogglePin,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({
      id: item.name + item.type,
    });
  const clickTimeoutRef = useRef(null);
  const [thumbnailError, setThumbnailError] = useState(false);
  const previewKind = inferPreviewKind(item);
  const thumbnailUrl =
    showThumbnails && item?.type === "file" && previewKind === "image"
      ? getResourcePreviewUrl(item)
      : "";

  useEffect(() => {
    setThumbnailError(false);
  }, [item?.identifier, item?.service, item?.qortalName, showThumbnails]);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    padding: "12px",
    marginBottom: "10px",
    borderRadius: "12px",
    cursor: "grab",
  };

  return (
    <ContextMenuPinnedFiles
      rename={rename}
      type={item?.type}
      removeFile={removeFile}
      removeDirectory={removeDirectory}
      fileSystem={fileSystem}
      currentPath={currentPath}
      moveNode={moveNode}
      item={item}
      onPreview={item?.type === "file" ? onPreview : undefined}
      onHydrateMetadata={item?.type === "file" ? onHydrateMetadata : undefined}
      pinned={Boolean(item?.pinned)}
      onTogglePin={item?.type === "file" ? onTogglePin : undefined}
    >
      <ButtonBase
        ref={setNodeRef}
        {...attributes}
        {...listeners}
        sx={{
          ...style,
          position: "relative",
          minHeight: "132px",
          width: "122px",
          background:
            item.type === "folder"
              ? "linear-gradient(180deg, rgba(54,72,121,0.35) 0%, rgba(27,36,60,0.35) 100%)"
              : "linear-gradient(180deg, rgba(66,66,66,0.35) 0%, rgba(36,36,36,0.35) 100%)",
          border: selected ? "2px solid #59b2ff" : "1px solid rgba(132, 162, 214, 0.35)",
          boxShadow: selected
            ? "0 0 0 2px rgba(89,178,255,0.2), 0 8px 24px rgba(0,0,0,0.28)"
            : "0 8px 24px rgba(0,0,0,0.22)",
          "&:hover": {
            borderColor: "#6aaef4",
            transform: "translateY(-2px)",
          },
        }}
        onClick={() => {
          if (item?.type !== "file") {
            onClick();
            return;
          }
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
          }
          clickTimeoutRef.current = setTimeout(() => {
            onClick();
            clickTimeoutRef.current = null;
          }, 220);
        }}
        onDoubleClick={() => {
          if (item?.type !== "file") {
            return;
          }
          if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
          }
          onPreview?.();
        }}
      >
        {item?.type === "file" && (
          <Checkbox
            checked={selected}
            size='small'
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleSelect?.();
            }}
            sx={{
              position: "absolute",
              top: "2px",
              left: "2px",
              zIndex: 2,
              p: "2px",
              color: "#93b8e7",
              "&.Mui-checked": { color: "#59b2ff" },
              backgroundColor: "rgba(15, 17, 22, 0.42)",
              borderRadius: "6px",
            }}
          />
        )}
        {item?.type === "file" && Boolean(item?.pinned) && (
          <PushPinIcon
            sx={{
              position: "absolute",
              top: "6px",
              right: "6px",
              fontSize: "17px",
              color: "#7fc3ff",
              opacity: 0.92,
              zIndex: 2,
            }}
          />
        )}
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: "8px",
            width: "100%",
            alignItems: "center",
          }}
        >
          <Avatar
            sx={{
              height: "48px",
              width: "48px",
              alignSelf: "center",
              backgroundColor:
                item.type === "folder"
                  ? "rgba(60,106,190,0.42)"
                  : "rgba(88,88,88,0.45)",
            }}
          >
            {item.type === "folder" ? (
              <FolderIcon sx={{ color: "#c9ddff" }} />
            ) : thumbnailUrl && !thumbnailError ? (
              <Box
                component='img'
                src={thumbnailUrl}
                onError={() => setThumbnailError(true)}
                sx={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "inherit",
                }}
              />
            ) : (
              <AttachFileIcon sx={{ color: "#f1f1f1" }} />
            )}
          </Avatar>
          <Typography
            sx={{
              width: "100%",
              wordBreak: "break-word",
              textWrap: "wrap",
              textAlign: "center",
              fontSize: "14px",
              lineHeight: "1.25",
              fontWeight: 500,
              color: "#f7f9ff",
            }}
          >
            {getItemDisplayName(item)}
          </Typography>
        </Box>
      </ButtonBase>
    </ContextMenuPinnedFiles>
  );
};

export const Manager = ({
  myAddress,
  groups,
  ownedNames = [],
  activeName = "",
  onChangeActiveName,
}) => {
  const [fileSystemPublic, setFileSystemPublic] = useState(null);
  const [fileSystemPrivate, setFileSystemPrivate] = useState(null);
  const [fileSystemGroup, setFileSystemGroup] = useState(initialGroupFileSystem);
  const [selectedGroup, setSelectedGroup] = useState(null);

  const [mode, setMode] = useState("public");

  const [fileSystem, setFileSystem] = useMemo(() => {
    if (mode === "public") {
      return [fileSystemPublic, setFileSystemPublic];
    } else if (mode === "group") {
      if (selectedGroup) {
        const selectedGroupState =
          fileSystemGroup[selectedGroup] || initialFileSystem;
        const setSelectedGroupState = (newState) => {
          setFileSystemGroup((prev) => ({
            ...(prev || {}),
            [selectedGroup]: newState,
          }));
        };
        return [selectedGroupState, setSelectedGroupState];
      }
      return [fileSystemGroup, setFileSystemGroup];
    } else {
      return [fileSystemPrivate, setFileSystemPrivate];
    }
  }, [
    mode,
    fileSystemPublic,
    fileSystemPrivate,
    fileSystemGroup,
    selectedGroup,
  ]);

  const { isShow, onCancel, onOk, show, type } = useModal();
  const [newDirName, setNewDirName] = useState("");
  const [newName, setNewName] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [selectedFileKeys, setSelectedFileKeys] = useState([]);
  const [showThumbnails, setShowThumbnails] = useState(() => {
    try {
      return localStorage.getItem(SHOW_THUMBNAILS_KEY) === "1";
    } catch (error) {
      return false;
    }
  });
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveTargetPath, setBulkMoveTargetPath] = useState([]);
  const currentName =
    (typeof activeName === "string" && activeName.trim()) ||
    (typeof myAddress?.name?.name === "string" && myAddress.name.name.trim()) ||
    "";

  const [currentPath, setCurrentPath] = useState(["Root"]);
  const [isOpenPublish, setIsOpenPublish] = useState(false);
  const currentFolder = useMemo(() => {
    if (!fileSystem) return "";
    let folder = fileSystem[0];
    for (const segment of currentPath.slice(1)) {
      folder = folder.children.find(
        (child) => child.name === segment && child.type === "folder"
      );
    }
    return folder;
  }, [currentPath, fileSystem]);

  useEffect(() => {
    if (!selectedGroup && groups?.length > 0) {
      setSelectedGroup(groups[0]?.groupId);
    }
  }, [groups]);

  useEffect(() => {
    setSelectedFileKeys([]);
  }, [mode, selectedGroup]);

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_THUMBNAILS_KEY, showThumbnails ? "1" : "0");
    } catch (error) {}
  }, [showThumbnails]);

  const handleNavigate = (folderName) => {
    setSelectedFileKeys([]);
    setCurrentPath((prev) => [...prev, folderName]);
  };

  const handleBack = () => {
    if (currentPath.length > 1) {
      setSelectedFileKeys([]);
      setCurrentPath((prev) => prev.slice(0, -1));
    }
  };

  useEffect(() => {
    if (!myAddress?.address) return;
    const fetchFileSystem = async () => {
      const data = await getPersistedFileSystemQManager(myAddress?.address);
      if (data?.private && data?.public) {
        setFileSystemPublic(data?.public);
        setFileSystemPrivate(data?.private);
        const groupData =
          data?.group && !Array.isArray(data.group) ? data.group : initialGroupFileSystem;
        setFileSystemGroup(groupData);
      } else {
        setFileSystemPublic(initialFileSystem);
        setFileSystemPrivate(initialFileSystem);
        setFileSystemGroup(initialGroupFileSystem);
      }
    };
    fetchFileSystem();
  }, [myAddress?.address]);

  useEffect(() => {
    if (fileSystemPublic && fileSystemPrivate && myAddress?.address) {
      const payload = {
        public: fileSystemPublic,
        private: fileSystemPrivate,
        group: fileSystemGroup,
      };

      saveFileSystemQManagerEverywhere(payload, myAddress?.address).catch(
        (error) => {
          console.error("Failed to persist Q-Manager filesystem state:", error);
        }
      );
    }
  }, [
    fileSystemPublic,
    fileSystemPrivate,
    fileSystemGroup,
    myAddress?.address,
  ]);

  const addDirectoryToCurrent = (directoryName) => {
    if (!directoryName || currentPath.length === 0) return false;

    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
    const targetFolder = currentPath[currentPath.length - 1]; // Current directory
    const parents = currentPath.slice(0, -1); // Parent directories

    let currentNodes = updatedFileSystem;

    // Traverse the parent directories
    for (const parent of parents) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return false; // Parent folder not found
      currentNodes = parentNode.children; // Move deeper into the tree
    }

    // Find the current directory
    const currentFolderNode = currentNodes.find(
      (node) => node.name === targetFolder && node.type === "folder"
    );
    if (currentFolderNode) {
      currentFolderNode.children = currentFolderNode.children || [];

      // Ensure unique directory name
      const existingNames = currentFolderNode.children
        .filter((child) => child.type === "folder") // Only check against other folders
        .map((child) => child.name);
      const uniqueDirectoryName = ensureUniqueName(
        directoryName,
        existingNames
      );

      // Add the new directory
      currentFolderNode.children.push({
        type: "folder",
        name: uniqueDirectoryName,
        children: [],
      });

      setFileSystem(updatedFileSystem); // Update the state
      return true;
    }

    return false; // Current directory not found
  };

  const addNodeByPath = (
    pathArray = currentPath,
    newNode,
    nodes = fileSystem
  ) => {
    if (pathArray.length === 0) return false;

    const updatedFileSystem = JSON.parse(JSON.stringify(nodes)); // Deep copy to avoid mutating state
    const target = pathArray[pathArray.length - 1]; // Last item is the target directory
    const parents = pathArray.slice(0, -1); // All but the last item are parent directories

    let currentNodes = updatedFileSystem;

    // Traverse through the parent directories
    for (const parent of parents) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return false; // Parent folder not found
      currentNodes = parentNode.children; // Move deeper into the tree
    }

    // Add the new node to the target directory
    const targetNode = currentNodes.find(
      (node) => node.name === target && node.type === "folder"
    );
    if (targetNode) {
      targetNode.children = targetNode.children || [];

      // Ensure unique name for the new node based on type
      const existingNames = targetNode.children
        .filter((child) => child.type === newNode.type) // Only check for conflicts within the same type
        .map((child) => child.name);

      newNode.name = ensureUniqueName(newNode.name, existingNames);
      if (newNode.type === "file" && !newNode.displayName) {
        newNode.displayName = newNode.name;
      }

      targetNode.children.push(newNode);
      setFileSystem(updatedFileSystem); // Update the state
      return true;
    }

    return false; // Target directory not found
  };

  const removeByNodePath = async (
    pathArray = currentPath,
    filename,
    nodes = fileSystem
  ) => {
    if (pathArray.length === 0) return false;
    try {
      await show("delete-file");
      const updatedFileSystem = JSON.parse(JSON.stringify(nodes)); // Deep copy to avoid mutating state
      const targetFolder = pathArray[pathArray.length - 1]; // Last item in the path is the target folder
      const parents = pathArray.slice(0, -1); // All but the last item are parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through the parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const targetFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!targetFolderNode || !targetFolderNode.children) return false; // Target folder not found or has no children

      // Find and remove the file
      const fileIndex = targetFolderNode.children.findIndex(
        (child) => child.name === filename && child.type === "file"
      );
      if (fileIndex !== -1) {
        targetFolderNode.children.splice(fileIndex, 1); // Remove the file from the children array
        setFileSystem(updatedFileSystem); // Update the state
        return true;
      }

      return false; // File not found
    } catch (error) {}
  };

  // Helper function to ensure unique filenames
  const ensureUniqueName = (name, existingNames) => {
    if (!existingNames.includes(name)) return name;

    const nameParts = name.split(".");
    const extension = nameParts.length > 1 ? `.${nameParts.pop()}` : ""; // Extract extension
    let baseName = nameParts.join(".");

    let copyNumber = 1;
    let newName = `${baseName}-copy${extension}`;
    while (existingNames.includes(newName)) {
      copyNumber++;
      newName = `${baseName}-copy${copyNumber}${extension}`;
    }

    return newName;
  };

  const cloneInitialFileSystem = () =>
    JSON.parse(JSON.stringify(initialFileSystem));

  const buildResourceKey = (file) =>
    `${file?.qortalName || ""}|${file?.service || ""}|${file?.identifier || ""}|${
      file?.group || 0
    }`;

  const collectResourceKeys = (nodes, collected = new Set()) => {
    if (!Array.isArray(nodes)) return collected;
    for (const node of nodes) {
      if (!node) continue;
      if (node.type === "file") {
        collected.add(buildResourceKey(node));
      }
      if (Array.isArray(node.children)) {
        collectResourceKeys(node.children, collected);
      }
    }
    return collected;
  };

  const mergeDiscoveredFilesIntoTree = (treeNodes, filesToAdd) => {
    const nextTree =
      Array.isArray(treeNodes) && treeNodes.length > 0
        ? JSON.parse(JSON.stringify(treeNodes))
        : cloneInitialFileSystem();

    if (!nextTree[0]) {
      nextTree[0] = { type: "folder", name: "Root", children: [] };
    }
    nextTree[0].children = nextTree[0].children || [];

    let recoveredFolder = nextTree[0].children.find(
      (child) =>
        child.type === "folder" && child.name === RECOVERED_IMPORTS_FOLDER
    );

    if (!recoveredFolder) {
      recoveredFolder = {
        type: "folder",
        name: RECOVERED_IMPORTS_FOLDER,
        children: [],
      };
      nextTree[0].children.push(recoveredFolder);
    }

    recoveredFolder.children = recoveredFolder.children || [];

    const existingResourceKeys = collectResourceKeys(nextTree);
    const existingNames = recoveredFolder.children
      .filter((child) => child.type === "file")
      .map((child) => child.name);

    let addedCount = 0;
    for (const file of filesToAdd) {
      const key = buildResourceKey(file);
      if (existingResourceKeys.has(key)) continue;

      const uniqueName = ensureUniqueName(
        file?.name || file?.identifier || "Recovered file",
        existingNames
      );
      existingNames.push(uniqueName);
      existingResourceKeys.add(key);

      recoveredFolder.children.push({
        ...file,
        type: "file",
        name: uniqueName,
        displayName: file?.displayName || uniqueName,
      });
      addedCount++;
    }

    return {
      nextTree,
      addedCount,
    };
  };

  const discoverAndImportPublishedQManagerFiles = async () => {
    const promise = (async () => {
      const ownerName = await resolvePreferredName(currentName, myAddress?.address);
      if (!ownerName) {
        throw new Error("Could not determine your Qortal name");
      }

      const discovered = await discoverQManagerResourcesByName(ownerName);
      if (!Array.isArray(discovered) || discovered.length === 0) {
        throw new Error("No previously published Q-Manager files were found");
      }

      const groupedByTarget = discovered.reduce(
        (acc, resource) => {
          const identifier = resource?.identifier || "";
          const groupFromIdentifier = /^grp-(\d+)-q-manager/i.exec(identifier);
          const inferredGroupId =
            Number(resource?.groupId) ||
            Number(groupFromIdentifier?.[1]) ||
            (identifier.startsWith("grp-") ? Number(selectedGroup) || 0 : 0) ||
            0;
          const normalizedResource = {
            type: "file",
            name: resource?.name || resource?.identifier,
            displayName:
              resource?.displayName ||
              resource?.filename ||
              resource?.name ||
              resource?.identifier,
            identifier,
            service: resource?.service,
            qortalName: resource?.qortalName || ownerName,
            mimeType: resource?.mimeType,
            sizeInBytes: resource?.sizeInBytes,
            ...(inferredGroupId > 0
              ? {
                  group: inferredGroupId,
                  groupName:
                    groups?.find(
                      (groupItem) => groupItem.groupId === inferredGroupId
                    )?.groupName || `Group ${inferredGroupId}`,
                }
              : {}),
          };

          if (inferredGroupId > 0) {
            if (!acc.group[inferredGroupId]) {
              acc.group[inferredGroupId] = [];
            }
            acc.group[inferredGroupId].push(normalizedResource);
            return acc;
          }

          const isPrivate =
            normalizedResource?.service?.includes("_PRIVATE") ||
            normalizedResource?.identifier?.startsWith("p-");

          if (isPrivate) {
            acc.private.push(normalizedResource);
          } else {
            acc.public.push(normalizedResource);
          }
          return acc;
        },
        { public: [], private: [], group: {} }
      );

      let totalAdded = 0;

      const publicMerge = mergeDiscoveredFilesIntoTree(
        fileSystemPublic,
        groupedByTarget.public
      );
      if (publicMerge.addedCount > 0) {
        setFileSystemPublic(publicMerge.nextTree);
        totalAdded += publicMerge.addedCount;
      }

      const privateMerge = mergeDiscoveredFilesIntoTree(
        fileSystemPrivate,
        groupedByTarget.private
      );
      if (privateMerge.addedCount > 0) {
        setFileSystemPrivate(privateMerge.nextTree);
        totalAdded += privateMerge.addedCount;
      }

      if (Object.keys(groupedByTarget.group).length > 0) {
        const nextGroupState =
          fileSystemGroup && !Array.isArray(fileSystemGroup)
            ? { ...fileSystemGroup }
            : {};

        for (const [groupIdKey, files] of Object.entries(groupedByTarget.group)) {
          const groupId = Number(groupIdKey);
          const currentGroupTree = nextGroupState[groupId] || cloneInitialFileSystem();
          const mergedGroup = mergeDiscoveredFilesIntoTree(currentGroupTree, files);
          if (mergedGroup.addedCount > 0) {
            nextGroupState[groupId] = mergedGroup.nextTree;
            totalAdded += mergedGroup.addedCount;
          }
        }

        setFileSystemGroup(nextGroupState);
      }

      if (totalAdded === 0) {
        throw new Error(
          "Previously published Q-Manager files were found, but they are already in your current structure"
        );
      }

      setCurrentPath(["Root"]);
      return { added: totalAdded };
    })();

    openToast(promise, {
      loading: "Finding and importing your published Q-Manager files...",
      success: "Published Q-Manager files imported",
      error: (err) => `Import failed: ${err?.error || err?.message || err}`,
    });

    return promise;
  };

  const renameByPath = async (item) => {
    try {
      const pathArray = currentPath; // Get the current path
      const oldName = item.name; // Original name of the item
      const oldDisplayName = getItemDisplayName(item);
      setNewName(oldDisplayName);
      const newNameInput = await show("rename"); // Prompt user for the new name
      const type = item.type; // Type of the item (file or folder)

      // Ensure the new name is not empty
      if (!newNameInput || newNameInput.trim() === "") return false;

      let newName = newNameInput.trim(); // Trim spaces
      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = pathArray[pathArray.length - 1]; // Current directory
      const parents = pathArray.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) return false; // Current directory not found or empty

      // Check for conflicts with the new name within the same type
      const existingNames = currentFolderNode.children
        .filter((child) => child.type === type)
        .map((child) => child.name);

      // Ensure a unique name if there is a conflict
      if (type === "folder" && existingNames.includes(newName)) {
        let copyIndex = 1;
        const baseName = newName.replace(/(-copy\d*)?$/, ""); // Remove any existing "-copy" suffix
        while (existingNames.includes(newName)) {
          newName = `${baseName}-copy${copyIndex}`;
          copyIndex++;
        }
      }

      // Find the target node by name and type
      const targetNode = currentFolderNode.children.find(
        (child) => child.name === oldName && child.type === type
      );
      if (targetNode) {
        if (type === "file") {
          targetNode.displayName = newName;
          setFileSystem(updatedFileSystem);
          return true;
        }
        targetNode.name = newName; // Update the name
        setFileSystem(updatedFileSystem); // Update the state
        return true;
      }

      return false; // File or folder not found
    } catch (error) {
      console.log("error", error);
    } finally {
      setNewName("");
    }
  };

  const updateByPath = async (item) => {
    try {
      const pathArray = currentPath; // Get the current path
      const name = item.name; // Original name of the item
      const type = item.type; // Type of the item (file or folder)

      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = pathArray[pathArray.length - 1]; // Current directory
      const parents = pathArray.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse through parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) {
          console.error("Parent folder not found");
          return false; // Parent folder not found
        }
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the target folder
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) {
        console.error("Current directory not found or empty");
        return false; // Current directory not found or empty
      }

      // Find the target node by name and type
      const targetNodeIndex = currentFolderNode.children.findIndex(
        (child) => child.name === name && child.type === type
      );

      if (targetNodeIndex !== -1) {
        // Update the node in the file system
        currentFolderNode.children[targetNodeIndex] = {
          ...currentFolderNode.children[targetNodeIndex],
          ...item,
        };

        setFileSystem(updatedFileSystem); // Update the state
        return true;
      }

      console.error("File or folder not found");
      return false; // File or folder not found
    } catch (error) {
      console.error("Error updating file system:", error);
      return false;
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;

    if (!over) return;

    const activeIndex = currentFolder.children.findIndex(
      (item) => item.name + item.type === active.id
    );
    const overIndex = currentFolder.children.findIndex(
      (item) => item.name + item.type === over.id
    );

    const updatedChildren = arrayMove(
      currentFolder.children,
      activeIndex,
      overIndex
    );

    setFileSystem((prev) => {
      const updateFolder = (folder) => {
        if (folder.name === currentFolder.name) {
          return { ...folder, children: updatedChildren };
        }
        if (folder.children) {
          return { ...folder, children: folder.children.map(updateFolder) };
        }
        return folder;
      };
      return prev.map(updateFolder);
    });
  };

  const deleteFolderInCurrent = async (folderName) => {
    if (!folderName || currentPath.length === 0) return false;
    try {
      await show("delete-directory");
      const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem)); // Deep copy to avoid state mutation
      const targetFolder = currentPath[currentPath.length - 1]; // Current directory
      const parents = currentPath.slice(0, -1); // Parent directories

      let currentNodes = updatedFileSystem;

      // Traverse the parent directories
      for (const parent of parents) {
        const parentNode = currentNodes.find(
          (node) => node.name === parent && node.type === "folder"
        );
        if (!parentNode) return false; // Parent folder not found
        currentNodes = parentNode.children; // Move deeper into the tree
      }

      // Find the current directory
      const currentFolderNode = currentNodes.find(
        (node) => node.name === targetFolder && node.type === "folder"
      );
      if (!currentFolderNode || !currentFolderNode.children) return false; // Current directory not found or empty

      // Find and remove the folder by name
      const folderIndex = currentFolderNode.children.findIndex(
        (child) => child.name === folderName && child.type === "folder"
      );
      if (folderIndex !== -1) {
        currentFolderNode.children.splice(folderIndex, 1); // Remove the folder
        setFileSystem(updatedFileSystem); // Update the state
        return true;
      }

      return false; // Folder not found
    } catch (error) {}
  };

  const traverseToFolder = (pathArray, nodes) => {
    let currentNodes = nodes;

    for (const dir of pathArray) {
      if (!currentNodes || !Array.isArray(currentNodes)) {
        console.error(`Invalid currentNodes for dir: ${dir}`);
        return null;
      }

      const folder = currentNodes.find(
        (node) => node.name === dir && node.type === "folder"
      );

      if (!folder) {
        console.error(`Folder not found: ${dir}`);
        return null; // Folder not found
      }

      currentNodes = folder.children;
    }

    return currentNodes; // Returns the children array of the target folder
  };

  const moveNodeByPath = (
    nodeName,
    nodeType,
    sourcePathArray,
    targetPathArray
  ) => {
    if (!nodeName || !nodeType || sourcePathArray.length === 0) {
      console.error("Invalid parameters");
      return false;
    }

    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem));

    // Updated traverseToFolder function (as above)
    const traverseToFolder = (pathArray, nodes) => {
      let currentNodes = nodes;
      let folder = null;

      for (const dir of pathArray) {
        folder = currentNodes.find(
          (node) => node.name === dir && node.type === "folder"
        );
        if (!folder) {
          console.error(`Folder not found: ${dir}`);
          return null;
        }
        currentNodes = folder.children;
      }

      return folder;
    };

    // Locate the source folder (where the node currently resides)
    const sourceFolder = traverseToFolder(sourcePathArray, updatedFileSystem);
    if (!sourceFolder || !sourceFolder.children) {
      console.error("Source folder not found");
      return false;
    }

    // Locate the target folder
    const targetFolder =
      targetPathArray.length > 0
        ? traverseToFolder(targetPathArray, updatedFileSystem)
        : { children: updatedFileSystem };

    if (!targetFolder || !targetFolder.children) {
      console.error("Target folder not found");
      return false;
    }

    // Find and remove the node from the source folder
    const nodeIndex = sourceFolder.children.findIndex(
      (node) => node.name === nodeName && node.type === nodeType
    );

    if (nodeIndex === -1) {
      console.error("Node not found in source folder");
      return false;
    }

    const [nodeToMove] = sourceFolder.children.splice(nodeIndex, 1);

    // Check for naming conflicts in the target folder
    const existingNames = targetFolder.children
      .filter((node) => node.type === nodeType)
      .map((node) => node.name);

    nodeToMove.name = ensureUniqueName(nodeToMove.name, existingNames);

    // Add the node to the target folder
    targetFolder.children.push(nodeToMove);

    // Update the state
    setFileSystem(updatedFileSystem);
    return true;
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 10, // Set a distance to avoid triggering drag on small movements
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        distance: 10, // Also apply to touch
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const visibleItems = useMemo(() => {
    const baseItems = currentFolder?.children || [];
    if (mode !== "group") return baseItems;
    return baseItems.filter(
      (item) =>
        item.type === "folder" ||
        (item.type === "file" && item?.group === selectedGroup)
    );
  }, [currentFolder?.children, mode, selectedGroup]);

  const selectedVisibleFiles = useMemo(() => {
    return visibleItems.filter(
      (item) =>
        item?.type === "file" &&
        selectedFileKeys.includes(getNodeSelectionKey(item))
    );
  }, [visibleItems, selectedFileKeys]);

  const selectedSizeSummary = useMemo(() => {
    let totalBytes = 0;
    let knownCount = 0;
    for (const item of selectedVisibleFiles) {
      const size = getItemSizeBytes(item);
      if (size === null) continue;
      totalBytes += size;
      knownCount++;
    }
    return {
      totalBytes,
      knownCount,
      unknownCount: selectedVisibleFiles.length - knownCount,
    };
  }, [selectedVisibleFiles]);

  const toggleSelectFile = (item) => {
    if (item?.type !== "file") return;
    const key = getNodeSelectionKey(item);
    setSelectedFileKeys((prev) =>
      prev.includes(key)
        ? prev.filter((entry) => entry !== key)
        : [...prev, key]
    );
  };

  const togglePinByPath = (item) => {
    if (!item || item?.type !== "file") return;
    updateByPath({
      ...item,
      pinned: !item?.pinned,
    });
  };

  const clearSelection = () => {
    setSelectedFileKeys([]);
  };

  const removeSelectedFromManager = () => {
    if (selectedVisibleFiles.length === 0) return;
    const selectedKeys = new Set(
      selectedVisibleFiles.map((item) => getNodeSelectionKey(item))
    );
    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem));
    let currentNodes = updatedFileSystem;

    for (const parent of currentPath.slice(0, -1)) {
      const parentNode = currentNodes.find(
        (node) => node.name === parent && node.type === "folder"
      );
      if (!parentNode) return;
      currentNodes = parentNode.children;
    }

    const targetFolder = currentNodes.find(
      (node) =>
        node.name === currentPath[currentPath.length - 1] &&
        node.type === "folder"
    );
    if (!targetFolder || !Array.isArray(targetFolder.children)) return;

    targetFolder.children = targetFolder.children.filter((child) => {
      if (child?.type !== "file") return true;
      return !selectedKeys.has(getNodeSelectionKey(child));
    });

    setFileSystem(updatedFileSystem);
    clearSelection();
  };

  const renderFolderTreeForBulkMove = (directories, path = []) => {
    return (directories || [])
      .filter((node) => node?.type === "folder")
      .map((dir) => {
        const fullPath = [...path, dir.name];
        const isSelectedTarget =
          fullPath.join("/") === bulkMoveTargetPath.join("/");
        const isCurrentPath = fullPath.join("/") === currentPath.join("/");

        return (
          <Box key={fullPath.join("/")}>
            <ButtonBase
              onClick={() => {
                if (isCurrentPath) return;
                setBulkMoveTargetPath(fullPath);
              }}
              sx={{
                width: "100%",
                justifyContent: "flex-start",
                px: "8px",
                py: "6px",
                borderRadius: "8px",
                opacity: isCurrentPath ? 0.6 : 1,
                backgroundColor: isSelectedTarget
                  ? "rgba(89,178,255,0.2)"
                  : "transparent",
              }}
            >
              <FolderIcon
                sx={{
                  mr: "8px",
                  color: isSelectedTarget ? "#74c6ff" : "#b6cff0",
                }}
              />
              <Typography sx={{ fontSize: "14px" }}>{dir.name}</Typography>
            </ButtonBase>
            {Array.isArray(dir.children) && dir.children.length > 0 && (
              <Box sx={{ pl: "16px" }}>
                {renderFolderTreeForBulkMove(dir.children, fullPath)}
              </Box>
            )}
          </Box>
        );
      });
  };

  const moveSelectedToPath = () => {
    if (selectedVisibleFiles.length === 0 || bulkMoveTargetPath.length === 0) {
      return;
    }

    const selectedKeys = new Set(
      selectedVisibleFiles.map((item) => getNodeSelectionKey(item))
    );

    const updatedFileSystem = JSON.parse(JSON.stringify(fileSystem));

    const traverseFolder = (pathArray) => {
      let nodes = updatedFileSystem;
      let folder = null;
      for (const part of pathArray) {
        folder = nodes.find((node) => node.name === part && node.type === "folder");
        if (!folder) return null;
        nodes = folder.children;
      }
      return folder;
    };

    const sourceFolder = traverseFolder(currentPath);
    const targetFolder = traverseFolder(bulkMoveTargetPath);
    if (!sourceFolder || !targetFolder) return;

    sourceFolder.children = sourceFolder.children || [];
    targetFolder.children = targetFolder.children || [];

    const movedNodes = [];
    sourceFolder.children = sourceFolder.children.filter((node) => {
      if (node?.type !== "file") return true;
      if (!selectedKeys.has(getNodeSelectionKey(node))) return true;
      movedNodes.push(node);
      return false;
    });

    for (const node of movedNodes) {
      const existingNames = targetFolder.children
        .filter((child) => child.type === node.type)
        .map((child) => child.name);
      node.name = ensureUniqueName(node.name, existingNames);
      targetFolder.children.push(node);
    }

    setFileSystem(updatedFileSystem);

    setShowBulkMoveModal(false);
    setBulkMoveTargetPath([]);
    clearSelection();
  };

  const deleteSelectedFromQDN = async () => {
    if (selectedVisibleFiles.length === 0) return;
    const filesToDelete = [...selectedVisibleFiles];
    const tombstoneData64 = btoa("d");
    const ownerName = await resolvePreferredName(currentName, myAddress?.address);

    const promise = (async () => {
      if (!ownerName || typeof ownerName !== "string") {
        throw new Error("Could not determine Qortal name for delete");
      }
      const resources = filesToDelete
        .map((file) => ({
          service: getServiceName(file),
          identifier: file?.identifier,
          data64: tombstoneData64,
        }))
        .filter((resource) => resource?.service && resource?.identifier);

      if (resources.length === 0) {
        throw new Error("No valid files selected for QDN delete");
      }

      try {
        await qortalRequest({
          action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
          name: ownerName,
          resources,
        });
      } catch (multiDeleteError) {
        const failedIdentifiers = [];
        for (const resource of resources) {
          try {
            await qortalRequest({
              action: "PUBLISH_QDN_RESOURCE",
              name: ownerName,
              service: resource.service,
              identifier: resource.identifier,
              data64: resource.data64,
            });
          } catch (singleDeleteError) {
            failedIdentifiers.push(resource.identifier);
          }
        }
        if (failedIdentifiers.length > 0) {
          throw new Error(
            `Failed to delete ${failedIdentifiers.length} item(s): ${failedIdentifiers.join(
              ", "
            )}`
          );
        }
      }

      removeSelectedFromManager();
    })();

    openToast(promise, {
      loading: "Deleting selected files from QDN...",
      success: "Selected files deleted from QDN",
      error: (err) => `Delete failed: ${err?.error || err?.message || err}`,
    });

    return promise;
  };

  if (!fileSystem) return null;

  return (
    <Box sx={{ padding: "8px" }}>
      <Box sx={{ width: "100%", bgcolor: "background.paper" }}>
        <Tabs
          value={mode}
          onChange={async (_, newValue) => {
            clearSelection();
            setCurrentPath(["Root"]);
            setMode(newValue);
          }}
          centered
        >
          <Tab label='public' value='public' />
          <Tab label='private' value='private' />
          <Tab label='groups' value='group' />
        </Tabs>
      </Box>
      <Spacer height='20px' />
      <Box
        sx={{
          display: "flex",
          gap: "10px",
          alignItems: "center",
          width: "100%",
          justifyContent: "center",
        }}
      >
        <Typography
          sx={{
            fontSize: "20",
          }}
        >
          Q-Manager
        </Typography>
      </Box>
      {ownedNames?.length > 1 && (
        <Box
          sx={{
            px: "20px",
            pb: "8px",
          }}
        >
          <Label>Active name</Label>
          <Select
            size='small'
            value={currentName}
            onChange={(e) => {
              onChangeActiveName?.(e.target.value);
            }}
            sx={{ width: "300px" }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#333333",
                  color: "#ffffff",
                },
              },
            }}
          >
            {ownedNames.map((nameValue) => (
              <MenuItem key={nameValue} value={nameValue}>
                {nameValue}
              </MenuItem>
            ))}
          </Select>
        </Box>
      )}
      {mode === "group" && (
        <Box
          sx={{
            paddingLeft: "20px",
          }}
        >
          <Label>Select group</Label>
          <Select
            size='small'
            labelId='label-manager-groups'
            id='id-manager-groups'
            value={selectedGroup}
            displayEmpty
            onChange={(e) => {
              clearSelection();
              if (!selectedGroup && groups?.length > 0 && !e.target.value) {
                setCurrentPath(["Root"]);
                setSelectedGroup(groups[0]?.groupId);
                return;
              }
              setCurrentPath(["Root"]);
              setSelectedGroup(e.target.value);
            }}
            sx={{
              width: "300px",
            }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#333333", // Background of the dropdown
                  color: "#ffffff", // Text color
                },
              },
            }}
          >
            {groups?.map((group) => {
              return (
                <MenuItem key={group.groupId} value={group.groupId}>
                  {group?.groupName}
                </MenuItem>
              );
            })}
          </Select>
        </Box>
      )}
      <Box
        sx={{
          px: "18px",
          py: "6px",
          display: "flex",
          justifyContent: "flex-start",
        }}
      >
        <FormControlLabel
          sx={{ m: 0 }}
          control={
            <Checkbox
              size='small'
              checked={showThumbnails}
              onChange={(event) => setShowThumbnails(event.target.checked)}
            />
          }
          label={
            <Typography sx={{ fontSize: "14px" }}>Show thumbnails</Typography>
          }
        />
      </Box>
      {mode === "group" && !selectedGroup ? (
        <></>
      ) : (
        <>
          <Stack
            direction='row'
            spacing={2}
            sx={{
              position: "fixed",
              bottom: "0px",
              right: "0px",
              height: "60px",
              left: "0px",
              alignItems: "center",
              justifyContent: "flex-start",
              paddingLeft: "20px",
              paddingBottom: "10px",
              backgroundColor: "rgb(39, 40, 44)",
              zIndex: 5,
              width: "100%",
            }}
          >
            {selectedVisibleFiles.length > 0 ? (
              <>
                <Typography variant='body2' sx={{ opacity: 0.85 }}>
                  {selectedVisibleFiles.length} selected
                </Typography>
                <Typography variant='body2' sx={{ opacity: 0.75 }}>
                  {selectedSizeSummary.knownCount > 0
                    ? `Size: ${formatBytes(selectedSizeSummary.totalBytes)}${
                        selectedSizeSummary.unknownCount > 0
                          ? ` (${selectedSizeSummary.unknownCount} unknown)`
                          : ""
                      }`
                    : "Size: unknown"}
                </Typography>
                <ButtonBase
                  onClick={() => {
                    clearSelection();
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant='body2'>Unselect</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    setBulkMoveTargetPath([]);
                    setShowBulkMoveModal(true);
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant='body2'>Move</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    removeSelectedFromManager();
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant='body2'>Remove</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={async () => {
                    try {
                      await deleteSelectedFromQDN();
                    } catch (error) {}
                  }}
                  sx={{
                    gap: "5px",
                    background: "#7b2f2f88",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <Typography variant='body2'>Delete from QDN</Typography>
                </ButtonBase>
              </>
            ) : (
              <>
                <ButtonBase
                  onClick={async () => {
                    try {
                      await show("export-data");
                    } catch (error) {}
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <SaveAltIcon sx={{ fontSize: "28px" }} />
                  <Typography variant='body2'>Save data</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={async () => {
                    try {
                      const dirname = await show("new-directory");
                      addDirectoryToCurrent(dirname);
                    } catch (error) {
                    } finally {
                      setNewDirName("");
                    }
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <CreateNewFolderIcon sx={{ fontSize: "28px" }} />
                  <Typography variant='body2'>+Folder</Typography>
                </ButtonBase>
                <ButtonBase
                  onClick={() => {
                    setIsOpenPublish(true);
                  }}
                  sx={{
                    gap: "5px",
                    background: "#4444",
                    padding: "5px",
                    borderRadius: "5px",
                  }}
                >
                  <InsertDriveFileIcon sx={{ fontSize: "28px" }} />
                  <Typography variant='body2'>+File</Typography>
                </ButtonBase>
              </>
            )}
          </Stack>
          <Box
            sx={{
              display: "flex",
              gap: "15px",
              alignItems: "center",
              padding: "10px",
            }}
          >
            {/* <Button
          variant="contained"
          disabled={currentPath.length <= 1}
          onClick={handleBack}
          size="small"
        >
          Back
        </Button> */}
            <FileSystemBreadcrumbs
              currentPath={currentPath}
              setCurrentPath={setCurrentPath}
            />
          </Box>
          <Spacer height='5px' />
          <AppsContainer
            sx={{
              gap: "0px",
              justifyContent: "flex-start",
              width: "100%",
            }}
          >
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={visibleItems?.map((item) => item.name + item.type)}
              >
                {visibleItems?.map((item) => (
                  <SortableItem
                    key={item.name + item.type}
                    item={item}
                    fileSystem={fileSystem}
                    currentPath={currentPath}
                    selected={selectedFileKeys.includes(getNodeSelectionKey(item))}
                    showThumbnails={showThumbnails}
                    onToggleSelect={() => toggleSelectFile(item)}
                    moveNode={moveNodeByPath}
                    onPreview={() => {
                      setPreviewFile(item);
                    }}
                    onHydrateMetadata={(metadata) => {
                      if (!metadata || Object.keys(metadata).length === 0) return;
                      updateByPath({
                        ...item,
                        ...metadata,
                      });
                      setSelectedFile((prev) => {
                        if (!prev) return prev;
                        if (getNodeSelectionKey(prev) !== getNodeSelectionKey(item)) {
                          return prev;
                        }
                        return {
                          ...prev,
                          ...metadata,
                        };
                      });
                    }}
                    onTogglePin={() => {
                      togglePinByPath(item);
                    }}
                    rename={() => {
                      renameByPath(item);
                    }}
                    removeFile={() => {
                      removeByNodePath(undefined, item.name, undefined);
                    }}
                    removeDirectory={() => {
                      deleteFolderInCurrent(item.name);
                    }}
                    onClick={() => {
                      if (item.type === "folder") handleNavigate(item.name);
                      else setSelectedFile(item);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </AppsContainer>
        </>
      )}

      {isOpenPublish && (
        <ShowAction
          myName={currentName}
          addNodeByPath={addNodeByPath}
          handleClose={() => setIsOpenPublish(false)}
          selectedAction={{
            action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
            files: [],
          }}
          mode={mode}
          groups={groups}
          selectedGroup={selectedGroup}
        />
      )}
      {isShow && (
        <Dialog
          open={isShow}
          aria-labelledby='alert-dialog-title'
          aria-describedby='alert-dialog-description'
          PaperProps={{
            style: {
              backgroundColor: "rgb(39, 40, 44)",
              color: "#27282c !important",
            },
          }}
        >
          {type === "delete-directory" && (
            <>
              <DialogContent>
                <Typography>
                  Are you sure you want to delete this directory
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button variant='contained' onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant='contained'
                  onClick={() => onOk(newDirName)}
                  autoFocus
                >
                  Confirm
                </Button>
              </DialogActions>
            </>
          )}
          {type === "delete-file" && (
            <>
              <DialogContent>
                <Typography>
                  Are you sure you want to delete this file
                </Typography>
              </DialogContent>
              <DialogActions>
                <Button variant='contained' onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  variant='contained'
                  onClick={() => onOk(newDirName)}
                  autoFocus
                >
                  Confirm
                </Button>
              </DialogActions>
            </>
          )}

          {type === "new-directory" && (
            <>
              <DialogContent>
                <Label>Directory name</Label>
                <input
                  style={{
                    maxWidth: "100%",
                  }}
                  type='text'
                  className='custom-input'
                  value={newDirName}
                  onChange={(e) => setNewDirName(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button variant='contained' onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  disabled={!newDirName}
                  variant='contained'
                  onClick={() => onOk(newDirName)}
                  autoFocus
                >
                  Save
                </Button>
              </DialogActions>
            </>
          )}

          {type === "rename" && (
            <>
              <DialogContent>
                <Label>Rename</Label>
                <input
                  style={{
                    maxWidth: "100%",
                  }}
                  type='text'
                  className='custom-input'
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
              </DialogContent>
              <DialogActions>
                <Button variant='contained' onClick={onCancel}>
                  Cancel
                </Button>
                <Button
                  disabled={!newName}
                  variant='contained'
                  onClick={() => onOk(newName)}
                  autoFocus
                >
                  Save
                </Button>
              </DialogActions>
            </>
          )}
          {type === "export-data" && (
            <>
              <DialogContent>
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "20px",
                  }}
                >
                  <Button
                    variant='contained'
                    onClick={async () => {
                      try {
                        const payload = {
                          public: fileSystemPublic,
                          private: fileSystemPrivate,
                          group: fileSystemGroup,
                        };
                        const data64 = await objectToBase64({
                          ...payload,
                        });

                        const encryptedData = await qortalRequest({
                          action: "ENCRYPT_DATA",
                          data64,
                        });

                        const blob = new Blob([encryptedData], {
                          type: "text/plain",
                        });
                        const timestamp = new Date()
                          .toISOString()
                          .replace(/:/g, "-"); // Safe timestamp for filenames
                        const filename = `q-manager-backup-filesystem-${myAddress?.address}-${timestamp}.txt`;
                        await qortalRequest({
                          action: "SAVE_FILE",
                          filename,
                          blob,
                        });
                      } catch (error) {}
                    }}
                  >
                    Export filesystem data to local disk
                  </Button>
                  <Button
                    variant='contained'
                    onClick={async () => {
                      try {
                        const fileContent = await handleImportClick();
                        const decryptedData = await qortalRequest({
                          action: "DECRYPT_DATA",
                          encryptedData: fileContent,
                        });
                        const decryptToUnit8ArraySubject =
                          base64ToUint8Array(decryptedData);
                        const responseData = uint8ArrayToObject(
                          decryptToUnit8ArraySubject
                        );
                        if (responseData?.public && responseData?.private) {
                          setFileSystemPublic(responseData?.public);
                          setFileSystemPrivate(responseData?.private);
                          const groupData =
                            responseData?.group && !Array.isArray(responseData.group)
                              ? responseData.group
                              : initialGroupFileSystem;
                          setFileSystemGroup(groupData);
                          setCurrentPath(["Root"]);
                        }
                      } catch (error) {
                        console.log("error", error);
                      }
                    }}
                  >
                    Import filesystem
                  </Button>
                  <Button
                    variant='contained'
                    onClick={async () => {
                      const resolvedName = await resolvePreferredName(
                        currentName,
                        myAddress?.address
                      );
                      const promise = publishFileSystemQManagerToQDN({
                        name: resolvedName,
                        address: myAddress?.address,
                        fileSystemQManager: {
                          public: fileSystemPublic,
                          private: fileSystemPrivate,
                          group: fileSystemGroup,
                        },
                      });

                      openToast(promise, {
                        loading: "Publishing filesystem structure to QDN...",
                        success: "Filesystem structure published to QDN",
                        error: (err) =>
                          `Publish failed: ${err?.error || err?.message || err}`,
                      });
                      await promise;
                    }}
                  >
                    Publish filesystem structure to QDN
                  </Button>
                  <Button
                    variant='contained'
                    onClick={async () => {
                      const resolvedName = await resolvePreferredName(
                        currentName,
                        myAddress?.address
                      );
                      const promise = importFileSystemQManagerFromQDN(resolvedName);

                      openToast(promise, {
                        loading: "Importing filesystem structure from QDN...",
                        success: "Filesystem structure imported from QDN",
                        error: (err) =>
                          `Import failed: ${err?.error || err?.message || err}`,
                      });
                      const imported = await promise;

                      if (imported?.public && imported?.private) {
                        setFileSystemPublic(imported.public);
                        setFileSystemPrivate(imported.private);
                        const groupData =
                          imported?.group && !Array.isArray(imported.group)
                            ? imported.group
                            : initialGroupFileSystem;
                        setFileSystemGroup(groupData);
                        setCurrentPath(["Root"]);
                      }
                    }}
                  >
                    Import filesystem structure from QDN
                  </Button>
                  <Button
                    variant='contained'
                    onClick={async () => {
                      try {
                        await discoverAndImportPublishedQManagerFiles();
                      } catch (error) {}
                    }}
                  >
                    Find previously published Q-Manager files
                  </Button>
                </Box>
              </DialogContent>
              <DialogActions>
                <Button variant='contained' onClick={onCancel}>
                  Close
                </Button>
              </DialogActions>
            </>
          )}
        </Dialog>
      )}
      <Modal
        open={showBulkMoveModal}
        onClose={() => {
          setShowBulkMoveModal(false);
          setBulkMoveTargetPath([]);
        }}
      >
        <Box
          sx={{
            width: 420,
            maxWidth: "95%",
            margin: "auto",
            marginTop: "10%",
            backgroundColor: "#27282c",
            border: "1px solid #3a3f50",
            borderRadius: "10px",
            boxShadow: 24,
            p: 3,
            maxHeight: "80vh",
            overflowY: "auto",
          }}
        >
          <Typography sx={{ fontSize: "18px", mb: 1 }}>
            Move {selectedVisibleFiles.length} selected file
            {selectedVisibleFiles.length === 1 ? "" : "s"}
          </Typography>
          <Typography sx={{ fontSize: "13px", opacity: 0.75, mb: 2 }}>
            Choose target folder
          </Typography>
          {renderFolderTreeForBulkMove(fileSystem)}
          <Box sx={{ mt: 2, display: "flex", gap: "10px" }}>
            <Button
              variant='contained'
              disabled={!bulkMoveTargetPath.length}
              onClick={moveSelectedToPath}
            >
              Move here
            </Button>
            <Button
              variant='contained'
              onClick={() => {
                setShowBulkMoveModal(false);
                setBulkMoveTargetPath([]);
              }}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      </Modal>

      {selectedFile && (
        <SelectedFile
          groups={groups}
          mode={mode}
          selectedFile={selectedFile}
          setSelectedFile={setSelectedFile}
          updateByPath={updateByPath}
          selectedGroup={selectedGroup}
        />
      )}
      {previewFile && (
        <FilePreviewDialog
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </Box>
  );
};

export const AppsContainer = styled(Box)(({ theme }) => ({
  display: "flex",
  width: "90%",
  justifyContent: "space-evenly",
  gap: "10px",
  flexWrap: "wrap",
  alignItems: "flex-start",
  alignSelf: "center",
  paddingBottom: "50px",
}));
