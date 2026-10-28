ALTER TABLE public.expediente_receipt_items ADD COLUMN product_id uuid REFERENCES public.products(id), ADD COLUMN controls_stock boolean NOT NULL DEFAULT false, ADD COLUMN source_unit_id uuid REFERENCES public.units(id);
CREATE OR REPLACE FUNCTION public.is_inventory_controller() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_active_user() AND public.has_role(auth.uid(), 'controlador_estoque'); $$;
REVOKE ALL ON FUNCTION public.is_inventory_controller() FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.is_inventory_controller() TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.can_access_unit(_unit_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_active_user() AND (public.is_admin() OR public.is_viewer() OR public.is_inventory_controller() OR _unit_id = public.my_unit()); $$;
CREATE OR REPLACE FUNCTION public.is_expediente_dispatcher() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.is_active_user() AND (public.is_admin() OR public.is_inventory_controller()); $$;
CREATE POLICY units_controller_select ON public.units FOR SELECT TO authenticated USING(public.is_inventory_controller());
CREATE POLICY expediente_viewer_select ON public.expediente_receipts FOR SELECT TO authenticated USING(public.is_active_user() AND public.is_viewer());
CREATE POLICY expediente_items_viewer_select ON public.expediente_receipt_items FOR SELECT TO authenticated USING(public.is_active_user() AND public.is_viewer());
CREATE OR REPLACE FUNCTION public.enforce_semads_viewer() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.create_inventory_dispatch(_destination_unit_id uuid, _sent_at date, _items jsonb, _note text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_receipt uuid; v_number text; v_item jsonb; v_product uuid; v_source uuid; v_track boolean; v_qty numeric; v_name text; v_measure text; v_available numeric; v_reserved numeric; v_category uuid; v_sender text;
BEGIN
 IF NOT public.is_expediente_dispatcher() THEN RAISE EXCEPTION 'Somente o CEO ou Controlador de estoque pode enviar.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.units WHERE id=_destination_unit_id AND ativo AND lower(nome) NOT LIKE '%gabinete semads%' AND lower(nome) NOT LIKE '%centro de distribui%') THEN RAISE EXCEPTION 'Selecione uma unidade destinatária ativa.'; END IF;
 IF _sent_at IS NULL OR _sent_at > CURRENT_DATE THEN RAISE EXCEPTION 'Data de envio inválida.'; END IF;
 IF jsonb_typeof(_items) IS DISTINCT FROM 'array' OR jsonb_array_length(_items)=0 THEN RAISE EXCEPTION 'Informe os itens do recibo.'; END IF;
 SELECT COALESCE(NULLIF(nome,''),email) INTO v_sender FROM public.profiles WHERE user_id=auth.uid();
 v_number:=public.next_stock_receipt_number();
 INSERT INTO public.expediente_receipts(receipt_number,destination_unit_id,sent_by,sent_by_name,sent_at,note,material_type) VALUES(v_number,_destination_unit_id,auth.uid(),v_sender,_sent_at,_note,'outros') RETURNING id INTO v_receipt;
 FOR v_item IN SELECT value FROM jsonb_array_elements(_items) ORDER BY value->>'product_id' LOOP
  v_product:=NULLIF(v_item->>'product_id','')::uuid; v_source:=NULLIF(v_item->>'source_unit_id','')::uuid; v_track:=COALESCE((v_item->>'controls_stock')::boolean,false); v_qty:=(v_item->>'quantity')::numeric; v_name:=trim(v_item->>'name'); v_measure:=trim(v_item->>'unit');
  IF v_qty IS NULL OR v_qty<=0 OR v_qty='NaN'::numeric OR NULLIF(v_name,'') IS NULL OR NULLIF(v_measure,'') IS NULL THEN RAISE EXCEPTION 'Informe nome, quantidade positiva e unidade.'; END IF;
  IF v_product IS NOT NULL THEN SELECT nome,unidade_medida INTO v_name,v_measure FROM public.products WHERE id=v_product AND ativo; IF NOT FOUND THEN RAISE EXCEPTION 'Produto inválido.'; END IF; END IF;
  IF v_source IS NOT NULL THEN
   IF NOT v_track OR v_product IS NULL OR NOT EXISTS(SELECT 1 FROM public.units WHERE id=v_source AND ativo AND (lower(nome) LIKE '%gabinete semads%' OR lower(nome) LIKE '%centro de distribui%')) THEN RAISE EXCEPTION 'Origem do Centro inválida.'; END IF;
   SELECT quantidade INTO v_available FROM public.stock WHERE unit_id=v_source AND product_id=v_product FOR UPDATE;
   SELECT COALESCE(sum(i.quantity),0) INTO v_reserved FROM public.expediente_receipt_items i JOIN public.expediente_receipts r ON r.id=i.receipt_id WHERE i.source_unit_id=v_source AND i.product_id=v_product AND r.status='pending';
   IF COALESCE(v_available,0)-v_reserved < v_qty THEN RAISE EXCEPTION 'Saldo disponível para envio insuficiente: %.',COALESCE(v_available,0)-v_reserved; END IF;
  END IF;
  IF v_track AND v_product IS NULL THEN
   PERFORM pg_advisory_xact_lock(hashtext(lower(v_name)));
   SELECT id,unidade_medida INTO v_product,v_measure FROM public.products WHERE lower(trim(nome))=lower(v_name) AND ativo ORDER BY created_at LIMIT 1;
   IF v_product IS NULL THEN
    SELECT id INTO v_category FROM public.categories WHERE ativo ORDER BY created_at LIMIT 1;
    IF v_category IS NULL THEN INSERT INTO public.categories(nome) VALUES('Sem categoria') RETURNING id INTO v_category; END IF;
    v_measure:=trim(v_item->>'unit');
    INSERT INTO public.products(nome,category_id,unidade_medida) VALUES(v_name,v_category,v_measure) RETURNING id INTO v_product;
   END IF;
  END IF;
  INSERT INTO public.expediente_receipt_items(receipt_id,material_name,quantity,unit_measure,product_id,controls_stock,source_unit_id) VALUES(v_receipt,v_name,v_qty,v_measure,v_product,v_track,v_source);
 END LOOP;
 RETURN v_number;
END; $$;
REVOKE ALL ON FUNCTION public.create_inventory_dispatch(uuid,date,jsonb,text) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.create_inventory_dispatch(uuid,date,jsonb,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.confirm_expediente_receipt(_receipt_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_receipt record; v_item record; v_name text; v_movement uuid; v_available numeric;
BEGIN
 IF NOT public.is_active_user() OR NOT public.has_role(auth.uid(),'responsavel') THEN RAISE EXCEPTION 'Somente o usuário da unidade destinatária pode confirmar.'; END IF;
 SELECT * INTO v_receipt FROM public.expediente_receipts WHERE id=_receipt_id AND destination_unit_id=public.my_unit() FOR UPDATE;
 IF NOT FOUND OR v_receipt.status<>'pending' THEN RAISE EXCEPTION 'Recibo não encontrado ou já encerrado.'; END IF;
 SELECT COALESCE(NULLIF(nome,''),email) INTO v_name FROM public.profiles WHERE user_id=auth.uid();
 FOR v_item IN SELECT * FROM public.expediente_receipt_items WHERE receipt_id=_receipt_id AND controls_stock ORDER BY product_id LOOP
  IF v_item.source_unit_id IS NOT NULL THEN
   SELECT quantidade INTO v_available FROM public.stock WHERE unit_id=v_item.source_unit_id AND product_id=v_item.product_id FOR UPDATE;
   IF COALESCE(v_available,0)<v_item.quantity THEN RAISE EXCEPTION 'Estoque insuficiente no Centro para confirmar. Procure o controlador.'; END IF;
   INSERT INTO public.stock_movements(unit_id,product_id,tipo,quantidade,data,user_id,responsavel,observacao) VALUES(v_item.source_unit_id,v_item.product_id,'saida',v_item.quantity,CURRENT_DATE,auth.uid(),v_name,'ENVIO_MATERIAIS:'||v_receipt.receipt_number);
  END IF;
  INSERT INTO public.stock_movements(unit_id,product_id,tipo,quantidade,data,user_id,responsavel,observacao) VALUES(v_receipt.destination_unit_id,v_item.product_id,'entrada',v_item.quantity,CURRENT_DATE,auth.uid(),v_name,'PENDENTE_RECEBIMENTO|ENVIO_MATERIAIS:'||v_receipt.receipt_number) RETURNING id INTO v_movement;
  INSERT INTO public.stock_receipts(movement_id,confirmed_by,confirmed_by_name) VALUES(v_movement,auth.uid(),v_name);
 END LOOP;
 UPDATE public.expediente_receipts SET status='confirmed',confirmed_by=auth.uid(),confirmed_by_name=v_name,confirmed_at=now() WHERE id=_receipt_id;
END; $$;
REVOKE ALL ON FUNCTION public.confirm_expediente_receipt(uuid) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.confirm_expediente_receipt(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.assign_inventory_role(_user_id uuid,_role public.app_role) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT public.is_admin() OR NOT public.is_active_user() THEN RAISE EXCEPTION 'Somente o CEO define perfis.'; END IF;
 IF _user_id=auth.uid() OR public.has_role(_user_id,'admin') OR _role='admin' THEN RAISE EXCEPTION 'O perfil do CEO não pode ser alterado.'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=_user_id) THEN RAISE EXCEPTION 'Usuário inválido.'; END IF;
 DELETE FROM public.user_roles WHERE user_id=_user_id;
 INSERT INTO public.user_roles(user_id,role) VALUES(_user_id,_role);
END; $$;
REVOKE ALL ON FUNCTION public.assign_inventory_role(uuid,public.app_role) FROM PUBLIC,anon; GRANT EXECUTE ON FUNCTION public.assign_inventory_role(uuid,public.app_role) TO authenticated;
CREATE OR REPLACE FUNCTION public.send_from_central_deposit(_product_id uuid,_destination_unit_id uuid,_quantity numeric,_data date DEFAULT CURRENT_DATE,_observacao text DEFAULT NULL,_receipt_number text DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_source uuid; v_name text; v_unit text; BEGIN
 SELECT id INTO v_source FROM public.units WHERE ativo AND (lower(nome) LIKE '%gabinete semads%' OR lower(nome) LIKE '%centro de distribui%') ORDER BY created_at LIMIT 1;
 SELECT nome,unidade_medida INTO v_name,v_unit FROM public.products WHERE id=_product_id;
 RETURN public.create_inventory_dispatch(_destination_unit_id,_data,jsonb_build_array(jsonb_build_object('product_id',_product_id,'name',v_name,'unit',v_unit,'quantity',_quantity,'controls_stock',true,'source_unit_id',v_source)),_observacao);
END; $$;