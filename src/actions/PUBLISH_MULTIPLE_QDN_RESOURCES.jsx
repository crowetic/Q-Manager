import React, { useState } from "react";
import {
  Box,
  ButtonBase,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
  styled,
} from "@mui/material";
import ShortUniqueId from "short-unique-id";
import { fileToBase64 } from "../utils";
import { openToast } from "../components/openToast";
import Button from "../components/Button";
import { privateServices, services } from "../constants";
import { useDropzone } from "react-dropzone"; 

const uid = new ShortUniqueId({ length: 10 });

export const Label = styled("label")`
  font-family: 'IBM Plex Sans', sans-serif;
  font-size: 14px;
  display: block;
  margin-bottom: 4px;
  font-weight: 400;
`;

export const PUBLISH_MULTIPLE_QDN_RESOURCES = ({
  files: initialFiles = [],
  addNodeByPath,
  myName,
  mode,
  groups,
  selectedGroup,
}) => {
  const [files, setFiles] = useState(initialFiles);
  const [requestData, setRequestData] = useState({
    service: mode === "private" ? "DOCUMENT_PRIVATE" : "DOCUMENT",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState("");

  const { getRootProps, getInputProps } = useDropzone({
    multiple: true,
    onDrop: (acceptedFiles) => {
      // append new files to state
      setFiles((prev) => [...prev, ...acceptedFiles]);
    },
  });

  // Utility: derive filename parts & identifier
  const makeMeta = (file) => {
    const ext = file.name.includes(".")
      ? file.name.split(".").pop()
      : "";
    const title = file.name
      .split(".")
      .slice(0, -1)
      .join(".")
      .replace(/\s+/g, "_")
      .slice(0, 20) || "untitled";
    const filename = ext ? `${title}.${ext}` : title;
    const base = title.toLowerCase();
    const prefix =
      mode === "public"
        ? "pub"
        : mode === "private"
        ? "pvt"
        : `grp-${selectedGroup}`;
    const identifier = `${prefix}-q-manager-${base}`;
    return { filename, identifier };
  };

  const executeMulti = async () => {
    const promise = (async () => {
      if (mode === "group" && !selectedGroup)
        throw new Error("Please select a group");
      if (!requestData?.service) throw new Error("Please select a service");
      setIsLoading(true);

      // 1) build resources array
      const resources = [];
      const localMetaByIdentifier = new Map();
      for (const file of files) {
        const { filename, identifier } = makeMeta(file);
        const data64 = await fileToBase64(file);
        localMetaByIdentifier.set(identifier, {
          filename,
          mimeType: file?.type || "application/octet-stream",
          sizeInBytes: Number(file?.size) || 0,
        });

        if (mode === "group") {
          // group‐encrypt
          const encrypted = await qortalRequest({
            action: "ENCRYPT_QORTAL_GROUP_DATA",
            data64,
            groupId: selectedGroup,
          });
          resources.push({
            service: requestData.service,
            identifier,
            filename,
            mimeType: file.type,
            data64: encrypted,
            externalEncrypt: true,
          });
        } else if (mode === "private") {
          // private‐encrypt
          const encrypted = await qortalRequest({
            action: "ENCRYPT_DATA_WITH_SHARING_KEY",
            data64,
          });
          resources.push({
            service: requestData.service,
            identifier,
            filename,
            mimeType: file.type,
            data64: encrypted,
          });
        } else {
          // public
          resources.push({
            service: requestData.service,
            identifier,
            filename,
            mimeType: file.type,
            file, // raw File object
          });
        }
      }

      // 2) send multi-publish request
      const result = await qortalRequest({
        action: "PUBLISH_MULTIPLE_QDN_RESOURCES",
        resources,
      });

      // 3) update tree exactly like single publish
      for (const res of Array.isArray(result) ? result : [result]) {
        const { identifier, service, filename, mimeType } = res;
        const localMeta = localMetaByIdentifier.get(identifier) || {};
        const resolvedFilename = filename || localMeta?.filename || identifier;
        const resolvedMimeType =
          mimeType || localMeta?.mimeType || "application/octet-stream";
        const resolvedSizeValue =
          res?.sizeInBytes ??
          res?.size ??
          res?.dataSize ??
          res?.createdSize ??
          res?.totalSize ??
          localMeta?.sizeInBytes;
        const parsedSize = Number(resolvedSizeValue);
        const sizeInBytes =
          Number.isFinite(parsedSize) && parsedSize >= 0 ? parsedSize : undefined;
        const groupEntry =
          mode === "group"
            ? {
                group: selectedGroup,
                groupName: groups?.find((g) => g.groupId === selectedGroup)?.groupName,
              }
            : {};

        addNodeByPath(undefined, {
          type: "file",
          name: resolvedFilename,
          mimeType: resolvedMimeType,
          ...(sizeInBytes !== undefined ? { sizeInBytes } : {}),
          qortalName: myName,
          identifier,
          service,
          ...groupEntry,
        });
      }

      setFiles([]); // clear selection
      return result;
    })();

    await openToast(promise, {
      loading: "Publishing files...",
      success: "All files published!",
      error: (e) => `Publish failed: ${e.message || e.error || e}`,
    });

    try {
      const final = await promise;
      setResponse(JSON.stringify(final, null, 2));
    } catch (e) {
      setResponse(JSON.stringify(e, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ mb: 2, display: "flex", gap: 2, alignItems: "center" }}>
        <Box>
          <Label>Service</Label>
          <Select
            size="small"
            value={requestData.service}
            onChange={(e) =>
              setRequestData((p) => ({ ...p, service: e.target.value }))
            }
            sx={{ width: 200 }}
            MenuProps={{
              PaperProps: {
                sx: {
                  backgroundColor: "#1f2530",
                  color: "#ffffff",
                  backgroundImage: "none",
                  maxHeight: 380,
                },
              },
            }}
          >
            {(mode === "private" ? privateServices : services).map((s) => (
              <MenuItem key={s.name} value={s.name}>
                {s.name} (max {s.sizeLabel})
              </MenuItem>
            ))}
          </Select>
        </Box>
      </Box>

      <Box sx={{ mb: 2 }}>
        <Box
          {...getRootProps()}
          sx={{
            mb: 2,
            p: 2,
            border: "2px dashed #555",
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          <input {...getInputProps()} />
          <Typography>
            Click or drag files here to add more ({files.length})
          </Typography>
        </Box>
        <Typography>
          {files.length} file{files.length !== 1 ? "s" : ""} selected:
        </Typography>
        <ul>
          {files.map((f, i) => (
            <li key={i}>
              {f.name}{" "}
              <ButtonBase
                onClick={() =>
                  setFiles((prev) => prev.filter((_, idx) => idx !== i))
                }
              >
                Remove
              </ButtonBase>
            </li>
          ))}
        </ul>
      </Box>

      <Button
        name="Publish all"
        bgColor="#309ed1"
        onClick={executeMulti}
        disabled={files.length === 0 || isLoading}
      />

      <Box sx={{ mt: 3 }}>
        <Typography variant="h6">Response</Typography>
        {isLoading ? (
          <CircularProgress />
        ) : (
          <Box
            component="pre"
            sx={{ background: "#222", color: "#ddd", p: 2, borderRadius: 2 }}
          >
            {response}
          </Box>
        )}
      </Box>
    </Box>
  );
};
