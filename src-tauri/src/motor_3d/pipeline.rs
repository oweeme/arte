use wgpu::util::DeviceExt;
use crate::motor_3d::trazos::{Lienzo3D, BrushType};
use lyon::tessellation::*;
use lyon::math::point;
use bytemuck::{Pod, Zeroable};
use glam::{Mat4, Vec3};

#[repr(C)]
#[derive(Copy, Clone, Debug, Pod, Zeroable)]
pub struct Vertex {
    pub position: [f32; 3],
    pub color: [f32; 4],
}

pub struct PipelineGrafico {
    surface: wgpu::Surface<'static>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    render_pipeline: wgpu::RenderPipeline,
    vertex_buffer: Option<wgpu::Buffer>,
    index_buffer: Option<wgpu::Buffer>,
    num_indices: u32,
    bind_group: wgpu::BindGroup,
    uniform_buffer: wgpu::Buffer,
    pub aspect_ratio: f32,
}

impl PipelineGrafico {
    pub async fn new(window: tauri::WebviewWindow) -> Self {
        let size = window.inner_size().expect("No size");
        let aspect_ratio = size.width as f32 / size.height as f32;
        
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: wgpu::Backends::all(),
            ..Default::default()
        });
        
        let surface = unsafe { 
            let s = instance.create_surface(&window).expect("Error al crear superficie");
            std::mem::transmute::<wgpu::Surface<'_>, wgpu::Surface<'static>>(s)
        };
        
        let adapter = instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            compatible_surface: Some(&surface),
            force_fallback_adapter: false,
        }).await.expect("No adaptador");

        let (device, queue) = adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("Main Device"),
            required_features: wgpu::Features::empty(),
            required_limits: wgpu::Limits::downlevel_webgl2_defaults(),
            memory_hints: wgpu::MemoryHints::Performance,
        }, None).await.expect("Error al crear dispositivo");

        let surface_caps = surface.get_capabilities(&adapter);
        let surface_format = surface_caps.formats.iter().copied().find(|f| f.is_srgb()).unwrap_or(surface_caps.formats[0]);

        // ALGORITMO DINÁMICO DE ALPHA MODE (Mandatorio para evitar flickering)
        let alpha_mode = if surface_caps.alpha_modes.contains(&wgpu::CompositeAlphaMode::PreMultiplied) {
            wgpu::CompositeAlphaMode::PreMultiplied
        } else if surface_caps.alpha_modes.contains(&wgpu::CompositeAlphaMode::PostMultiplied) {
            wgpu::CompositeAlphaMode::PostMultiplied
        } else {
            surface_caps.alpha_modes[0]
        };

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Fifo, // V-Sync activado para eliminar parpadeo
            alpha_mode,
            view_formats: vec![],
            desired_maximum_frame_latency: 2,
        };
        surface.configure(&device, &config);

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Stroke Shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shaders.wgsl").into()),
        });

        let uniform_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Uniform Buffer"),
            size: 64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::VERTEX,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform,
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
            label: None,
        });

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: uniform_buffer.as_entire_binding(),
            }],
            label: None,
        });

        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: None,
            bind_group_layouts: &[&bind_group_layout],
            push_constant_ranges: &[],
        });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: None,
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[wgpu::VertexBufferLayout {
                    array_stride: std::mem::size_of::<Vertex>() as wgpu::BufferAddress,
                    step_mode: wgpu::VertexStepMode::Vertex,
                    attributes: &wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x4],
                }],
                compilation_options: Default::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::ALPHA_BLENDING),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: Default::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                ..Default::default()
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            multiview: None,
            cache: None,
        });

        Self {
            surface, device, queue, config, render_pipeline,
            vertex_buffer: None, index_buffer: None, num_indices: 0,
            bind_group, uniform_buffer, aspect_ratio,
        }
    }

    pub fn resize(&mut self, new_size: tauri::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.config.width = new_size.width;
            self.config.height = new_size.height;
            self.aspect_ratio = new_size.width as f32 / new_size.height as f32;
            self.surface.configure(&self.device, &self.config);
        }
    }

    pub fn actualizar_malla(&mut self, lienzo: &Lienzo3D) {
        let mut geometry: VertexBuffers<Vertex, u16> = VertexBuffers::new();
        let mut tessellator = StrokeTessellator::new();
        let min_dist_sq = 0.0001; 

        for trazo in &lienzo.trazos {
            if trazo.puntos.len() < 2 { continue; }
            let mut builder = lyon::path::Path::builder();
            let mut last_pos = trazo.puntos[0].position;
            builder.begin(point(last_pos.x, last_pos.y));
            let mut points_added = 1;
            for p in &trazo.puntos[1..] {
                if p.position.distance_squared(last_pos) > min_dist_sq {
                    builder.line_to(point(p.position.x, p.position.y));
                    last_pos = p.position;
                    points_added += 1;
                }
            }
            if points_added < 2 { continue; }
            builder.end(false);
            let path = builder.build();
            let mut options = StrokeOptions::default().with_line_cap(LineCap::Round).with_line_join(LineJoin::Round);
            match trazo.brush_type {
                BrushType::Flat => { options = options.with_line_width(trazo.thickness * 0.005); },
                BrushType::Round => { options = options.with_line_width(trazo.thickness * 0.01); },
                BrushType::Sketch => { options = options.with_line_width(trazo.thickness * 0.002); }
            }
            let stroke_color = trazo.color;
            let mut geometry_builder = BuffersBuilder::new(&mut geometry, move |vertex: StrokeVertex| {
                Vertex { position: [vertex.position().x, vertex.position().y, 0.0], color: stroke_color }
            });
            let _ = tessellator.tessellate_path(&path, &options, &mut geometry_builder);
        }

        if !geometry.vertices.is_empty() {
            self.vertex_buffer = Some(self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: None, contents: bytemuck::cast_slice(&geometry.vertices), usage: wgpu::BufferUsages::VERTEX,
            }));
            self.index_buffer = Some(self.device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                label: None, contents: bytemuck::cast_slice(&geometry.indices), usage: wgpu::BufferUsages::INDEX,
            }));
            self.num_indices = geometry.indices.len() as u32;
        } else { self.num_indices = 0; }
    }

    pub fn actualizar_orbita_camara(&self, pitch: f32, yaw: f32, zoom: f32) {
        let eye = Vec3::new(zoom * yaw.cos() * pitch.cos(), zoom * pitch.sin(), zoom * yaw.sin() * pitch.cos());
        let view = Mat4::look_at_rh(eye, Vec3::ZERO, Vec3::Y);
        let proj = Mat4::perspective_rh(45.0f32.to_radians(), self.aspect_ratio, 0.1, 100.0);
        self.queue.write_buffer(&self.uniform_buffer, 0, bytemuck::cast_slice(&(proj * view).to_cols_array()));
    }

    pub fn renderizar(&self, background_color: [f32; 4]) -> Result<(), wgpu::SurfaceError> {
        let output = self.surface.get_current_texture()?;
        let view = output.texture.create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self.device.create_command_encoder(&wgpu::CommandEncoderDescriptor { label: None });
        
        let clear_color = wgpu::Color { 
            r: background_color[0] as f64, 
            g: background_color[1] as f64, 
            b: background_color[2] as f64, 
            a: background_color[3] as f64 
        };

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: None,
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view, resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(clear_color),
                        store: wgpu::StoreOp::Store,
                    },
                })], ..Default::default()
            });
            if self.num_indices > 0 {
                if let (Some(vb), Some(ib)) = (&self.vertex_buffer, &self.index_buffer) {
                    render_pass.set_pipeline(&self.render_pipeline);
                    render_pass.set_bind_group(0, &self.bind_group, &[]);
                    render_pass.set_vertex_buffer(0, vb.slice(..));
                    render_pass.set_index_buffer(ib.slice(..), wgpu::IndexFormat::Uint16);
                    render_pass.draw_indexed(0..self.num_indices, 0, 0..1);
                }
            }
        }
        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }
}
