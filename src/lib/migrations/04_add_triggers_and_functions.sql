-- Step 4: Add function and trigger for auto-updating timestamps

-- Create function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_brick_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER trigger_update_brick_configurations_updated_at
  BEFORE UPDATE ON public.brick_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_brick_configurations_updated_at();